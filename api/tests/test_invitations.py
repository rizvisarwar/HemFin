"""Invitation tests that need no database."""

import hashlib
import json

import httpx
import pytest
from fastapi import FastAPI
from pydantic import SecretStr, ValidationError

from hemfin.core.config import get_settings
from hemfin.core.email import ResendEmailSender, UnconfiguredEmailSender, get_email_sender
from hemfin.modules.invitations.schemas import InvitationCreate, TokenBody
from hemfin.modules.invitations.service import hash_token, new_token


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
