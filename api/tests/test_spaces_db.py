"""DB-backed tests (run in CI against Postgres). Real token verification, mocked JWKS."""

import asyncio
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import func, select, text

from authkit import TestKey
from hemfin.core import db
from hemfin.core.security import TokenClaims
from hemfin.modules.spaces.models import Role, Space, SpaceMembership
from hemfin.modules.users.models import User
from hemfin.modules.users.service import ensure_user

pytestmark = pytest.mark.db


def _auth(key: TestKey, sub: UUID, email: str | None = None) -> dict[str, str]:
    return {"Authorization": f"Bearer {key.token(sub, email or f'{sub}@example.test')}"}


async def test_first_request_provisions_user_and_personal_space(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    sub = uuid4()
    r = await aclient.get("/api/v1/me", headers=_auth(key, sub))
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == str(sub)
    assert len(body["spaces"]) == 1
    space = body["spaces"][0]
    assert space["type"] == "personal"
    assert space["role"] == "owner"
    # Second request does not create anything new.
    r2 = await aclient.get("/api/v1/me", headers=_auth(key, sub))
    assert r2.json()["spaces"] == body["spaces"]


async def test_concurrent_first_requests_provision_once(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    sub = uuid4()
    results = await asyncio.gather(
        *[aclient.get("/api/v1/me", headers=_auth(key, sub)) for _ in range(8)]
    )
    assert [r.status_code for r in results] == [200] * 8
    assert len({r.json()["spaces"][0]["id"] for r in results}) == 1
    async with db.get_session_ctx() as s:
        users = (
            await s.execute(select(func.count()).select_from(User).where(User.id == sub))
        ).scalar_one()
        spaces = (
            await s.execute(select(func.count()).select_from(Space).where(Space.created_by == sub))
        ).scalar_one()
        members = (
            await s.execute(
                select(func.count())
                .select_from(SpaceMembership)
                .where(SpaceMembership.user_id == sub)
            )
        ).scalar_one()
    assert (users, spaces, members) == (1, 1, 1)


async def test_ensure_user_concurrent_sessions(aclient: httpx.AsyncClient) -> None:
    claims = TokenClaims(sub=uuid4(), email="race@example.test")

    async def one() -> UUID:
        async with db.get_session_ctx() as s:
            return (await ensure_user(s, claims)).id

    ids = await asyncio.gather(*[one() for _ in range(10)])
    assert set(ids) == {claims.sub}


async def test_one_personal_space_per_user_enforced_by_index(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    sub = uuid4()
    await aclient.get("/api/v1/me", headers=_auth(key, sub))
    from sqlalchemy.exc import IntegrityError

    async with db.get_session_ctx() as s:
        s.add(Space(type="personal", name="Another", created_by=sub))
        with pytest.raises(IntegrityError):
            await s.commit()


async def test_other_user_gets_404_on_space(aclient: httpx.AsyncClient, key: TestKey) -> None:
    a, b = uuid4(), uuid4()
    space_id = (await aclient.get("/api/v1/me", headers=_auth(key, a))).json()["spaces"][0]["id"]
    await aclient.get("/api/v1/me", headers=_auth(key, b))

    own = await aclient.get(f"/api/v1/spaces/{space_id}", headers=_auth(key, a))
    assert own.status_code == 200
    assert own.json()["role"] == "owner"

    other = await aclient.get(f"/api/v1/spaces/{space_id}", headers=_auth(key, b))
    unknown = await aclient.get(f"/api/v1/spaces/{uuid4()}", headers=_auth(key, b))
    assert other.status_code == 404
    assert unknown.status_code == 404
    # Identical bodies apart from instance/request id: existence is not revealed.
    assert other.json()["detail"] == unknown.json()["detail"]


async def test_space_requires_auth(aclient: httpx.AsyncClient) -> None:
    r = await aclient.get(f"/api/v1/spaces/{uuid4()}")
    assert r.status_code == 401


async def test_low_role_is_403_for_member_only(
    aclient: httpx.AsyncClient, authed_app: object, key: TestKey
) -> None:
    """A member below min_role gets 403; a non-member still gets 404."""
    from fastapi import Depends, FastAPI

    from hemfin.core.deps import SpaceAccess, require_space_member

    assert isinstance(authed_app, FastAPI)

    @authed_app.get("/api/v1/spaces/{space_id}/admin-only")
    async def admin_only(
        access: SpaceAccess = Depends(require_space_member(Role.admin)),  # noqa: B008
    ) -> dict[str, str]:
        return {"role": access.role}

    owner, member, stranger = uuid4(), uuid4(), uuid4()
    space_id = (await aclient.get("/api/v1/me", headers=_auth(key, owner))).json()["spaces"][0][
        "id"
    ]
    await aclient.get("/api/v1/me", headers=_auth(key, member))
    await aclient.get("/api/v1/me", headers=_auth(key, stranger))
    async with db.get_session_ctx() as s:
        s.add(SpaceMembership(space_id=UUID(space_id), user_id=member, role=Role.member))
        await s.commit()

    assert (
        await aclient.get(f"/api/v1/spaces/{space_id}/admin-only", headers=_auth(key, owner))
    ).status_code == 200
    assert (
        await aclient.get(f"/api/v1/spaces/{space_id}/admin-only", headers=_auth(key, member))
    ).status_code == 403
    assert (
        await aclient.get(f"/api/v1/spaces/{space_id}/admin-only", headers=_auth(key, stranger))
    ).status_code == 404


async def test_tables_live_in_app_schema() -> None:
    async with db.get_engine().connect() as conn:
        res = await conn.execute(
            text(
                "SELECT count(*) FROM information_schema.tables WHERE table_schema='app' "
                "AND table_name IN ('users','spaces','space_memberships')"
            )
        )
        assert res.scalar() == 3
    await db.dispose_engine()
