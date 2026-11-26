"""Invitation tests that need no database."""

import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI
from pydantic import SecretStr, ValidationError

from hemfin.core.config import get_settings
from hemfin.core.db import get_session
from hemfin.core.deps import get_current_user
from hemfin.core.email import ResendEmailSender, UnconfiguredEmailSender, get_email_sender
from hemfin.core.errors import CodedHTTPException, register_exception_handlers
from hemfin.modules.invitations import service
from hemfin.modules.invitations.schemas import InvitationCreate, TokenBody
from hemfin.modules.invitations.service import hash_token, new_token, resend_retry_after


def test_token_is_32_random_bytes_and_only_its_sha256_is_derived() -> None:
    a, b = new_token(), new_token()
    assert a != b
    assert len(a) >= 43  # 32 bytes, url-safe base64
    assert hash_token(a) == hashlib.sha256(a.encode()).hexdigest()
    assert a not in hash_token(a)


def test_token_body_is_masked_and_bounded() -> None:
    body = TokenBody(token=SecretStr("abc"))
    assert "abc" not in repr(body) and "abc" not in str(body)
    with pytest.raises(ValidationError):
        TokenBody(token=SecretStr(""))
    with pytest.raises(ValidationError):
        TokenBody(token=SecretStr("x" * 257))


def test_create_schema_lowercases_and_rejects_owner() -> None:
    assert InvitationCreate(email="  A.B@Example.TEST ").email == "a.b@example.test"
    with pytest.raises(ValidationError):
        InvitationCreate(email="a@b.test", role="owner")  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        InvitationCreate(email="nope")


def test_sender_selection_without_key_is_the_503_sender() -> None:
    cfg = get_settings().model_copy(update={"RESEND_API_KEY": None, "EMAIL_FROM": ""})
    assert isinstance(get_email_sender(cfg), UnconfiguredEmailSender)
    keyed = cfg.model_copy(update={"RESEND_API_KEY": SecretStr("k"), "EMAIL_FROM": "a@b.test"})
    assert isinstance(get_email_sender(keyed), ResendEmailSender)


async def test_openapi_has_no_token_in_paths_or_examples(authed_app: FastAPI) -> None:
    transport = httpx.ASGITransport(app=authed_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        spec = (await c.get("/openapi.json")).json()
    for path in spec["paths"]:
        assert "{token}" not in path and "token" not in path.split("{space_id}")[-1]
    assert "example" not in json.dumps(spec["components"]["schemas"]["TokenBody"])
    out = spec["components"]["schemas"]["InvitationOut"]["properties"]
    assert not {"token", "token_hash"} & set(out)
    assert spec["components"]["schemas"]["MemberRoleChange"]["properties"]["role"]["enum"] == [
        "admin",
        "member",
    ]
    resend = spec["paths"]["/api/v1/spaces/{space_id}/invitations/{invitation_id}/resend"]["post"]
    assert "Retry-After" in resend["responses"]["429"]["headers"]
    assert "/internal/jobs/daily" not in spec["paths"]


# --- preview regression: no attribute access after rollback ----------------------------------


class _Expiring:
    """Mimics an ORM object: after the session rolls back, attribute reads would lazy-load,
    which fails under asyncio (MissingGreenlet)."""

    def __init__(self, session: "_FakeSession", **values: Any) -> None:
        self._session = session
        self._values = values

    def __getattr__(self, name: str) -> Any:
        if name.startswith("_"):
            raise AttributeError(name)
        if self._session.rolled_back:
            raise RuntimeError("MissingGreenlet: lazy load of an expired attribute")
        return self._values[name]


class _FakeSession:
    def __init__(self) -> None:
        self.rolled_back = False

    async def rollback(self) -> None:
        self.rolled_back = True

    async def get(self, model: Any, key: Any) -> Any:
        if model is service.Space:
            return _Expiring(self, name="Home")
        return _Expiring(self, display_name="Alex")


async def test_preview_reads_orm_values_before_rollback(monkeypatch: pytest.MonkeyPatch) -> None:
    session = _FakeSession()

    async def fake_load(*_: Any) -> Any:
        return _Expiring(session, space_id=uuid4(), invited_by=uuid4())

    monkeypatch.setattr(service, "_load_for_invitee", fake_load)
    out = await service.preview(session, "t", "a@b.test", True)  # type: ignore[arg-type]
    assert (out.household_name, out.inviter_name) == ("Home", "Alex")
    assert session.rolled_back


# --- resend limits ----------------------------------------------------------------------------

NOW = datetime(2026, 1, 1, tzinfo=UTC)


def test_resend_cooldown_and_daily_cap() -> None:
    def wait(count: int, window: datetime | None, last: datetime | None) -> int | None:
        return resend_retry_after(
            resend_count=count, window_start=window, last_sent_at=last, now=NOW
        )

    assert wait(0, None, None) is None
    assert wait(0, None, NOW - timedelta(seconds=61)) is None
    assert wait(0, None, NOW - timedelta(seconds=10)) == 50  # cooldown
    # Daily cap reached: wait for the window to end, even when the cooldown has passed.
    window = NOW - timedelta(hours=1)
    assert wait(3, window, NOW - timedelta(minutes=5)) == 23 * 3600
    # The longer of the two waits wins.
    assert wait(3, window, NOW) == 23 * 3600
    # A window older than a day no longer counts.
    assert wait(3, NOW - timedelta(days=1, seconds=1), NOW - timedelta(minutes=5)) is None
    assert wait(2, window, NOW - timedelta(minutes=5)) is None


# --- problem+json codes and token exposure ----------------------------------------------------


async def test_coded_exception_renders_type_and_code() -> None:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/x")
    async def x() -> None:
        raise CodedHTTPException(409, "already_invited", "pending", headers={"Retry-After": "5"})

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as c:
        r = await c.get("/x")
    assert r.status_code == 409
    assert r.headers["content-type"].startswith("application/problem+json")
    body = r.json()
    assert body["code"] == "already_invited"
    assert body["type"] == "urn:hemfin:problem:already_invited"
    assert r.headers["retry-after"] == "5"


async def test_validation_error_does_not_echo_the_token(authed_app: FastAPI, key: Any) -> None:
    authed_app.dependency_overrides[get_current_user] = lambda: None  # no DB in this test
    authed_app.dependency_overrides[get_session] = lambda: None
    secret = "S" * 300  # over the length cap, so it is rejected with a 422
    token = key.token(uuid4(), "a@example.test", email_verified=True)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=authed_app), base_url="http://test"
    ) as c:
        r = await c.post(
            "/api/v1/invitations/preview",
            json={"token": secret},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 422
    assert secret not in r.text and "SSSSSSSS" not in r.text
