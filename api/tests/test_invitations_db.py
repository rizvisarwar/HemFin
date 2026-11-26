"""Invitations (DB-backed; runs in CI against Postgres). The email sender is a fake."""

import asyncio
import hashlib
import logging
import re
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI
from pydantic import SecretStr
from sqlalchemy import select, text, update

from authkit import TestKey
from hemfin.core import db
from hemfin.core.config import Settings, get_settings
from hemfin.core.email import EmailDeliveryError, get_email_sender
from hemfin.modules.invitations.models import Invitation
from hemfin.modules.spaces.models import Role, SpaceMembership

pytestmark = pytest.mark.db

API = "/api/v1/spaces"
INV = "/api/v1/invitations"
TOKEN_RE = re.compile(r"/invite#token=([A-Za-z0-9_-]+)")


class FakeSender:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []
        self.fail = False

    async def send(self, *, to: str, subject: str, text: str) -> None:
        if self.fail:
            raise EmailDeliveryError
        self.sent.append((to, subject, text))

    def last_token(self) -> str:
        m = TOKEN_RE.search(self.sent[-1][2])
        assert m, "no invite link in the email"
        return m.group(1)


@pytest.fixture
def outbox(authed_app: FastAPI) -> FakeSender:
    sender = FakeSender()
    authed_app.dependency_overrides[get_email_sender] = lambda: sender
    return sender


def _auth(
    key: TestKey, sub: UUID, email: str | None = None, verified: bool = True
) -> dict[str, str]:
    tok = key.token(sub, email or f"{sub}@example.test", email_verified=verified)
    return {"Authorization": f"Bearer {tok}"}


async def _user(c: httpx.AsyncClient, key: TestKey) -> UUID:
    sub = uuid4()
    assert (await c.get("/api/v1/me", headers=_auth(key, sub))).status_code == 200
    return sub


async def _household(c: httpx.AsyncClient, key: TestKey, owner: UUID) -> str:
    r = await c.post(API, json={"name": "Home"}, headers=_auth(key, owner))
    assert r.status_code == 201, r.text
    return str(r.json()["id"])


async def _add(space_id: str, user: UUID, role: Role) -> None:
    async with db.get_session_ctx() as s:
        s.add(SpaceMembership(space_id=UUID(space_id), user_id=user, role=role))
        await s.commit()


async def _role(space_id: str, user: UUID) -> str | None:
    async with db.get_session_ctx() as s:
        return (
            await s.execute(
                select(SpaceMembership.role).where(
                    SpaceMembership.space_id == UUID(space_id), SpaceMembership.user_id == user
                )
            )
        ).scalar_one_or_none()


async def _setup(c: httpx.AsyncClient, key: TestKey) -> tuple[str, UUID, UUID, UUID, UUID]:
    owner, admin, member, stranger = [await _user(c, key) for _ in range(4)]
    sid = await _household(c, key, owner)
    await _add(sid, admin, Role.admin)
    await _add(sid, member, Role.member)
    return sid, owner, admin, member, stranger


async def _skip_cooldown(invitation_id: str) -> None:
    """Pretend the last email went out two minutes ago (the resend cooldown is 60 s)."""
    async with db.get_session_ctx() as s:
        await s.execute(
            update(Invitation)
            .where(Invitation.id == UUID(invitation_id))
            .values(last_sent_at=datetime.now(UTC) - timedelta(minutes=2))
        )
        await s.commit()


def _new_email() -> str:
    return f"Invitee.{uuid4().hex[:10]}@Example.test"


async def _invite(
    c: httpx.AsyncClient, key: TestKey, sid: str, actor: UUID, email: str, role: str = "member"
) -> httpx.Response:
    return await c.post(
        f"{API}/{sid}/invitations", json={"email": email, "role": role}, headers=_auth(key, actor)
    )


async def _accept(
    c: httpx.AsyncClient, key: TestKey, token: str, sub: UUID, email: str, verified: bool = True
) -> httpx.Response:
    return await c.post(
        f"{INV}/accept", json={"token": token}, headers=_auth(key, sub, email, verified)
    )


async def _get(invitation_id: str) -> Invitation:
    async with db.get_session_ctx() as s:
        inv = await s.get(Invitation, UUID(invitation_id))
        assert inv is not None
        return inv


# --- create ----------------------------------------------------------------------------------


async def test_create_never_exposes_or_stores_the_token(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    sid, owner, admin, *_ = await _setup(aclient, key)
    email = _new_email()
    r = await _invite(aclient, key, sid, admin, email, "admin")
    assert r.status_code == 201, r.text
    body = r.json()
    token = outbox.last_token()
    assert body["email"] == email.lower()
    assert body["role"] == "admin"
    assert body["status"] == "pending"
    assert "token" not in " ".join(body.keys())
    assert token not in r.text
    assert outbox.sent[0][0] == email.lower()
    assert outbox.sent[0][2].count("?") == 0  # fragment link, never a query string
    inv = await _get(body["id"])
    assert inv.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert token not in " ".join(str(v) for v in vars(inv).values())
    exp = inv.expires_at - datetime.now(UTC)
    assert timedelta(days=6, hours=23) < exp <= timedelta(days=7)
    listing = await aclient.get(f"{API}/{sid}/invitations", headers=_auth(key, owner))
    assert token not in listing.text and inv.token_hash not in listing.text
    assert "token" not in listing.text
    assert token not in caplog.text


async def test_create_rules(aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender) -> None:
    sid, owner, admin, member, stranger = await _setup(aclient, key)
    email = _new_email()
    assert (await _invite(aclient, key, sid, member, email)).status_code == 403
    assert (await _invite(aclient, key, sid, stranger, email)).status_code == 404
    assert (await _invite(aclient, key, sid, owner, email, "owner")).status_code == 422
    assert (
        await aclient.post(
            f"{API}/{sid}/invitations", json={"email": "not-an-email"}, headers=_auth(key, owner)
        )
    ).status_code == 422
    assert not outbox.sent
    # Personal space: 409.
    me = (await aclient.get("/api/v1/me", headers=_auth(key, owner))).json()
    personal = next(s["id"] for s in me["spaces"] if s["type"] == "personal")
    assert (await _invite(aclient, key, personal, owner, email)).status_code == 409
    # Already a member: distinct message (case-insensitive on the email).
    r_member = await _invite(aclient, key, sid, owner, f"{member}@EXAMPLE.test")
    assert r_member.status_code == 409
    assert "already a member" in r_member.json()["detail"]
    assert r_member.json()["code"] == "already_member"
    assert r_member.json()["type"] == "urn:hemfin:problem:already_member"
    # Pending invitation for the same email: a different message.
    assert (await _invite(aclient, key, sid, admin, email)).status_code == 201
    r_pending = await _invite(aclient, key, sid, owner, email.upper())
    assert r_pending.status_code == 409
    assert "already pending" in r_pending.json()["detail"]
    assert r_pending.json()["code"] == "already_invited"
    assert r_pending.json()["type"] == "urn:hemfin:problem:already_invited"
    assert r_pending.json()["detail"] != r_member.json()["detail"]
    assert r_pending.headers["content-type"].startswith("application/problem+json")


async def test_concurrent_creates_leave_one_pending(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender
) -> None:
    sid, owner, *_ = await _setup(aclient, key)
    email = _new_email()
    results = await asyncio.gather(*[_invite(aclient, key, sid, owner, email) for _ in range(4)])
    assert sorted(r.status_code for r in results) == [201, 409, 409, 409]


async def test_missing_email_config_is_503_and_stores_nothing(
    aclient: httpx.AsyncClient, key: TestKey, authed_app: FastAPI
) -> None:
    unconfigured = get_settings().model_copy(update={"RESEND_API_KEY": None, "EMAIL_FROM": ""})
    authed_app.dependency_overrides[get_settings] = lambda: unconfigured
    sid, owner, *_ = await _setup(aclient, key)
    r = await _invite(aclient, key, sid, owner, _new_email())
    assert r.status_code == 503
    assert r.headers["content-type"].startswith("application/problem+json")
    listing = await aclient.get(f"{API}/{sid}/invitations", headers=_auth(key, owner))
    assert listing.json()["items"] == []


async def test_delivery_failure_is_503_and_stores_nothing(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender
) -> None:
    sid, owner, *_ = await _setup(aclient, key)
    outbox.fail = True
    assert (await _invite(aclient, key, sid, owner, _new_email())).status_code == 503
    listing = await aclient.get(f"{API}/{sid}/invitations", headers=_auth(key, owner))
    assert listing.json()["items"] == []


# --- list ------------------------------------------------------------------------------------


async def test_list_roles_pagination_and_lazy_expiry(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender
) -> None:
    sid, owner, admin, member, stranger = await _setup(aclient, key)
    ids = [(await _invite(aclient, key, sid, owner, _new_email())).json()["id"] for _ in range(3)]
    url = f"{API}/{sid}/invitations"
    assert (await aclient.get(url, headers=_auth(key, member))).status_code == 403
    assert (await aclient.get(url, headers=_auth(key, stranger))).status_code == 404
    page1 = (await aclient.get(url, params={"limit": 2}, headers=_auth(key, admin))).json()
    assert len(page1["items"]) == 2 and page1["next_cursor"]
    page2 = (
        await aclient.get(
            url, params={"limit": 2, "cursor": page1["next_cursor"]}, headers=_auth(key, admin)
        )
    ).json()
    assert len(page2["items"]) == 1
    assert {i["id"] for i in page1["items"] + page2["items"]} == set(ids)
    # Lazy expiry on read.
    async with db.get_session_ctx() as s:
        await s.execute(
            update(Invitation)
            .where(Invitation.id == UUID(ids[0]))
            .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        await s.commit()
    items = (await aclient.get(url, headers=_auth(key, owner))).json()["items"]
    assert {i["id"]: i["status"] for i in items}[ids[0]] == "expired"


# --- resend / revoke -------------------------------------------------------------------------


async def test_resend_rotates_token_and_old_one_is_dead(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender
) -> None:
    sid, owner, admin, member, stranger = await _setup(aclient, key)
    email = _new_email()
    created = (await _invite(aclient, key, sid, owner, email)).json()
    old = outbox.last_token()
    url = f"{API}/{sid}/invitations/{created['id']}/resend"
    assert (await aclient.post(url, headers=_auth(key, member))).status_code == 403
    assert (await aclient.post(url, headers=_auth(key, stranger))).status_code == 404
    await _skip_cooldown(created["id"])
    r = await aclient.post(url, headers=_auth(key, admin))
    assert r.status_code == 200, r.text
    new = outbox.last_token()
    assert new != old and new not in r.text
    invitee = uuid4()
    assert (await _accept(aclient, key, old, invitee, email)).status_code == 404
    assert (await _accept(aclient, key, new, invitee, email)).status_code == 200


async def test_resend_is_rate_limited_with_retry_after(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender
) -> None:
    sid, owner, *_ = await _setup(aclient, key)
    created = (await _invite(aclient, key, sid, owner, _new_email())).json()
    url = f"{API}/{sid}/invitations/{created['id']}/resend"
    # Cooldown: the invitation was just emailed, so an immediate resend is refused.
    r = await aclient.post(url, headers=_auth(key, owner))
    assert r.status_code == 429
    assert r.headers["content-type"].startswith("application/problem+json")
    assert r.json()["code"] == "resend_limited"
    assert 0 < int(r.headers["retry-after"]) <= 60
    for _ in range(3):
        await _skip_cooldown(created["id"])
        assert (await aclient.post(url, headers=_auth(key, owner))).status_code == 200
    # Daily cap: refused even after the cooldown, and Retry-After points to the window end.
    await _skip_cooldown(created["id"])
    sent = len(outbox.sent)
    r = await aclient.post(url, headers=_auth(key, owner))
    assert r.status_code == 429
    assert r.headers["content-type"].startswith("application/problem+json")
    assert 60 < int(r.headers["retry-after"]) <= 86400
    assert len(outbox.sent) == sent
    # A new window opens after a day.
    async with db.get_session_ctx() as s:
        await s.execute(
            update(Invitation)
            .where(Invitation.id == UUID(created["id"]))
            .values(resend_window_start=datetime.now(UTC) - timedelta(days=1, minutes=1))
        )
        await s.commit()
    assert (await aclient.post(url, headers=_auth(key, owner))).status_code == 200


async def test_resend_delivery_failure_keeps_old_token(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender
) -> None:
    sid, owner, *_ = await _setup(aclient, key)
    email = _new_email()
    created = (await _invite(aclient, key, sid, owner, email)).json()
    old = outbox.last_token()
    await _skip_cooldown(created["id"])
    outbox.fail = True
    r = await aclient.post(
        f"{API}/{sid}/invitations/{created['id']}/resend", headers=_auth(key, owner)
    )
    assert r.status_code == 503
    outbox.fail = False
    assert (await _accept(aclient, key, old, uuid4(), email)).status_code == 200


async def test_revoke(aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender) -> None:
    sid, owner, admin, member, stranger = await _setup(aclient, key)
    email = _new_email()
    created = (await _invite(aclient, key, sid, owner, email)).json()
    token = outbox.last_token()
    url = f"{API}/{sid}/invitations/{created['id']}"
    assert (await aclient.delete(url, headers=_auth(key, member))).status_code == 403
    assert (await aclient.delete(url, headers=_auth(key, stranger))).status_code == 404
    assert (await aclient.delete(url, headers=_auth(key, admin))).status_code == 204
    assert (await _get(created["id"])).status == "revoked"
    assert (await aclient.delete(url, headers=_auth(key, admin))).status_code == 409
    assert (await _accept(aclient, key, token, uuid4(), email)).status_code == 404
    # A revoked invitation does not block a fresh one.
    assert (await _invite(aclient, key, sid, owner, email)).status_code == 201
    # Another space's invitation id is a 404 here.
    other = await _household(aclient, key, owner)
    assert (
        await aclient.delete(
            f"{API}/{other}/invitations/{created['id']}", headers=_auth(key, owner)
        )
    ).status_code == 404


# --- accept / decline / preview --------------------------------------------------------------


async def test_accept_new_user_and_existing_user(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender
) -> None:
    sid, owner, *_ = await _setup(aclient, key)
    # A user who has never called the API: provisioned by the accept call itself.
    new_email, new_sub = _new_email(), uuid4()
    await _invite(aclient, key, sid, owner, new_email, "admin")
    r = await _accept(aclient, key, outbox.last_token(), new_sub, new_email)
    assert r.status_code == 200, r.text
    assert r.json()["space_id"] == sid and r.json()["role"] == "admin"
    assert await _role(sid, new_sub) == "admin"
    # An existing user, signed in with a differently-cased email.
    existing = await _user(aclient, key)
    mail = f"{existing}@example.test"
    await _invite(aclient, key, sid, owner, mail.upper().replace("@EXAMPLE.TEST", "@example.test"))
    r2 = await _accept(
        aclient, key, outbox.last_token(), existing, mail.replace("example", "Example")
    )
    assert r2.status_code == 200, r2.text
    assert await _role(sid, existing) == "member"
    # Invitations are marked accepted and appear that way in the list.
    items = (await aclient.get(f"{API}/{sid}/invitations", headers=_auth(key, owner))).json()
    assert [i["status"] for i in items["items"]] == ["accepted", "accepted"]


async def test_accept_failures_are_one_generic_404(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender
) -> None:
    sid, owner, *_ = await _setup(aclient, key)
    email = _new_email()
    created = (await _invite(aclient, key, sid, owner, email)).json()
    token = outbox.last_token()
    invitee = uuid4()
    responses = {
        "unknown": await _accept(aclient, key, secrets.token_urlsafe(32), invitee, email),
        "wrong_email": await _accept(aclient, key, token, invitee, _new_email()),
        "unverified": await _accept(aclient, key, token, invitee, email, verified=False),
    }
    async with db.get_session_ctx() as s:
        await s.execute(
            update(Invitation)
            .where(Invitation.id == UUID(created["id"]))
            .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        await s.commit()
    responses["expired"] = await _accept(aclient, key, token, invitee, email)
    bodies = set()
    for name, r in responses.items():
        assert r.status_code == 404, name
        assert r.headers["content-type"].startswith("application/problem+json")
        data = r.json()
        data.pop("request_id", None)
        bodies.add(str(data))
        assert token not in r.text
    assert len(bodies) == 1
    assert await _role(sid, invitee) is None
    assert (await _get(created["id"])).status in ("expired", "pending")


async def test_wrong_email_does_not_consume_the_invitation(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender
) -> None:
    sid, owner, *_ = await _setup(aclient, key)
    email = _new_email()
    await _invite(aclient, key, sid, owner, email)
    token = outbox.last_token()
    assert (await _accept(aclient, key, token, uuid4(), _new_email())).status_code == 404
    assert (await _accept(aclient, key, token, uuid4(), email)).status_code == 200


async def test_double_accept_creates_one_membership(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender
) -> None:
    sid, owner, *_ = await _setup(aclient, key)
    email, sub = _new_email(), uuid4()
    await _invite(aclient, key, sid, owner, email)
    token = outbox.last_token()
    first = await _accept(aclient, key, token, sub, email)  # provision the user first
    assert first.status_code == 200
    assert (await _accept(aclient, key, token, sub, email)).status_code == 404
    # Concurrent accepts on a fresh invitation: exactly one wins.
    email2, sub2 = _new_email(), await _user(aclient, key)
    await _invite(aclient, key, sid, owner, email2)
    token2 = outbox.last_token()
    results = await asyncio.gather(*[_accept(aclient, key, token2, sub2, email2) for _ in range(4)])
    assert sorted(r.status_code for r in results) == [200, 404, 404, 404]
    async with db.get_session_ctx() as s:
        n = (
            await s.execute(
                text(
                    "select count(*) from app.space_memberships "
                    "where space_id = :s and user_id = :u"
                ),
                {"s": sid, "u": sub2},
            )
        ).scalar_one()
    assert n == 1


async def test_two_users_cannot_share_one_invitation(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender
) -> None:
    sid, owner, *_ = await _setup(aclient, key)
    email = _new_email()
    await _invite(aclient, key, sid, owner, email)
    token = outbox.last_token()
    a, b = uuid4(), uuid4()
    results = await asyncio.gather(
        _accept(aclient, key, token, a, email), _accept(aclient, key, token, b, email)
    )
    assert sorted(r.status_code for r in results) == [200, 404]
    members = [u for u in (a, b) if await _role(sid, u)]
    assert len(members) == 1


async def test_preview_and_decline(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender
) -> None:
    sid, owner, *_ = await _setup(aclient, key)
    email, sub = _new_email(), uuid4()
    await _invite(aclient, key, sid, owner, email)
    token = outbox.last_token()
    h = _auth(key, sub, email)
    p = await aclient.post(f"{INV}/preview", json={"token": token}, headers=h)
    assert p.status_code == 200
    assert set(p.json()) == {"household_name", "inviter_name"}
    assert p.json()["household_name"] == "Home"
    # Preview does not consume; a wrong account sees the same generic 404.
    other = await aclient.post(
        f"{INV}/preview", json={"token": token}, headers=_auth(key, uuid4(), _new_email())
    )
    assert other.status_code == 404
    d = await aclient.post(f"{INV}/decline", json={"token": token}, headers=h)
    assert d.status_code == 204
    assert (
        await aclient.post(f"{INV}/decline", json={"token": token}, headers=h)
    ).status_code == 404
    assert (await _accept(aclient, key, token, sub, email)).status_code == 404
    assert await _role(sid, sub) is None
    # The token is never accepted in a URL path or query string.
    assert (await aclient.post(f"{INV}/accept/{token}", headers=h)).status_code in (404, 405)
    assert (await aclient.post(f"{INV}/accept?token={token}", headers=h)).status_code == 422


async def test_token_routes_require_auth(aclient: httpx.AsyncClient) -> None:
    for path in ("preview", "accept", "decline"):
        assert (await aclient.post(f"{INV}/{path}", json={"token": "x"})).status_code == 401


async def test_invitation_columns_hold_no_raw_token(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    sid, owner, *_ = await _setup(aclient, key)
    email, sub = _new_email(), uuid4()
    await _invite(aclient, key, sid, owner, email)
    token = outbox.last_token()
    await _accept(aclient, key, token, sub, email)
    await _accept(aclient, key, token, sub, email)
    async with db.get_session_ctx() as s:
        rows = (await s.execute(text("select i::text from app.invitations i"))).scalars().all()
    assert not any(token in row for row in rows)
    assert token not in caplog.text


# --- daily job -------------------------------------------------------------------------------


async def test_daily_job_expires_and_requires_secret(
    aclient: httpx.AsyncClient, key: TestKey, outbox: FakeSender, authed_app: FastAPI
) -> None:
    secret = secrets.token_hex(16)
    cfg: Settings = get_settings().model_copy(update={"JOB_SECRET": SecretStr(secret)})
    authed_app.dependency_overrides[get_settings] = lambda: cfg
    sid, owner, *_ = await _setup(aclient, key)
    created = (await _invite(aclient, key, sid, owner, _new_email())).json()
    async with db.get_session_ctx() as s:
        await s.execute(
            update(Invitation)
            .where(Invitation.id == UUID(created["id"]))
            .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        await s.commit()
    url = "/internal/jobs/daily"
    assert (await aclient.post(url)).status_code == 401
    assert (await aclient.post(url, headers={"X-Job-Secret": "wrong"})).status_code == 401
    ok = await aclient.post(url, headers={"X-Job-Secret": secret})
    assert ok.status_code == 200 and ok.json()["expired_invitations"] >= 1
    assert (await _get(created["id"])).status == "expired"
    again = await aclient.post(url, headers={"X-Job-Secret": secret})
    assert again.status_code == 200  # idempotent
