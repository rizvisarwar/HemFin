"""Household and member management (DB-backed; runs in CI against Postgres)."""

import asyncio
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import func, select

from authkit import TestKey
from hemfin.core import db
from hemfin.modules.spaces.models import Role, Space, SpaceMembership

pytestmark = pytest.mark.db

API = "/api/v1/spaces"


def _auth(key: TestKey, sub: UUID) -> dict[str, str]:
    return {"Authorization": f"Bearer {key.token(sub, f'{sub}@example.test')}"}


async def _user(c: httpx.AsyncClient, key: TestKey) -> UUID:
    sub = uuid4()
    assert (await c.get("/api/v1/me", headers=_auth(key, sub))).status_code == 200
    return sub


async def _household(c: httpx.AsyncClient, key: TestKey, owner: UUID, name: str = "Home") -> str:
    r = await c.post(API, json={"name": name}, headers=_auth(key, owner))
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
    """A household with owner, admin, member, plus a stranger."""
    owner, admin, member, stranger = [await _user(c, key) for _ in range(4)]
    sid = await _household(c, key, owner)
    await _add(sid, admin, Role.admin)
    await _add(sid, member, Role.member)
    return sid, owner, admin, member, stranger


# --- create / list -------------------------------------------------------------------------


async def test_create_trims_name_and_makes_owner(aclient: httpx.AsyncClient, key: TestKey) -> None:
    u = await _user(aclient, key)
    r = await aclient.post(API, json={"name": "  Our home  "}, headers=_auth(key, u))
    assert r.status_code == 201
    body = r.json()
    assert (body["name"], body["type"], body["role"]) == ("Our home", "household", "owner")


@pytest.mark.parametrize("name", ["", "   ", "x" * 81])
async def test_create_rejects_bad_names(
    aclient: httpx.AsyncClient, key: TestKey, name: str
) -> None:
    u = await _user(aclient, key)
    r = await aclient.post(API, json={"name": name}, headers=_auth(key, u))
    assert r.status_code == 422


async def test_household_cap_is_409_and_concurrency_safe(
    aclient: httpx.AsyncClient, key: TestKey, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Headroom: 14 simultaneous requests must never be limited by the default pool (5 + 10).
    real = db.create_async_engine
    monkeypatch.setattr(
        db, "create_async_engine", lambda *a, **kw: real(*a, **{**kw, "pool_size": 20})
    )
    await db.dispose_engine()
    u = await _user(aclient, key)
    results = await asyncio.gather(
        *[aclient.post(API, json={"name": f"H{i}"}, headers=_auth(key, u)) for i in range(14)]
    )
    codes = sorted(r.status_code for r in results)
    assert codes == [201] * 10 + [409] * 4
    again = await aclient.post(API, json={"name": "More"}, headers=_auth(key, u))
    assert again.status_code == 409
    assert again.headers["content-type"].startswith("application/problem+json")


async def test_list_spaces_with_role_count_and_cursor(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    owner, other = await _user(aclient, key), await _user(aclient, key)
    sid = await _household(aclient, key, owner)
    await _add(sid, other, Role.member)
    await _household(aclient, key, other, "Theirs")

    r = await aclient.get(API, headers=_auth(key, other))
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 3  # personal + joined + own
    by_id = {i["id"]: i for i in items}
    assert by_id[sid]["role"] == "member"
    assert by_id[sid]["member_count"] == 2
    assert {i["type"] for i in items} == {"personal", "household"}

    seen: list[str] = []
    cursor = None
    while True:
        params = {"limit": 1, **({"cursor": cursor} if cursor else {})}
        page = (await aclient.get(API, params=params, headers=_auth(key, other))).json()
        seen += [i["id"] for i in page["items"]]
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert sorted(seen) == sorted(by_id) and len(seen) == 3

    # A stranger's list never includes it.
    stranger = await _user(aclient, key)
    ids = [i["id"] for i in (await aclient.get(API, headers=_auth(key, stranger))).json()["items"]]
    assert sid not in ids


async def test_bad_cursor_and_limit(aclient: httpx.AsyncClient, key: TestKey) -> None:
    u = await _user(aclient, key)
    assert (
        await aclient.get(API, params={"cursor": "nope"}, headers=_auth(key, u))
    ).status_code == 422
    assert (await aclient.get(API, params={"limit": 0}, headers=_auth(key, u))).status_code == 422


# --- isolation -----------------------------------------------------------------------------


async def test_stranger_gets_404_everywhere(aclient: httpx.AsyncClient, key: TestKey) -> None:
    sid, owner, admin, _member, stranger = await _setup(aclient, key)
    h = _auth(key, stranger)
    for method, path, body in [
        ("GET", f"{API}/{sid}", None),
        ("PATCH", f"{API}/{sid}", {"name": "x"}),
        ("DELETE", f"{API}/{sid}", None),
        ("GET", f"{API}/{sid}/members", None),
        ("PATCH", f"{API}/{sid}/members/{admin}", {"role": "member"}),
        ("DELETE", f"{API}/{sid}/members/{admin}", None),
        ("POST", f"{API}/{sid}/transfer-ownership", {"user_id": str(stranger)}),
    ]:
        r = await aclient.request(method, path, json=body, headers=h)
        assert r.status_code == 404, (method, path, r.status_code)
        unknown = await aclient.request(
            method, path.replace(sid, str(uuid4())), json=body, headers=h
        )
        assert unknown.json()["detail"] == r.json()["detail"]
    assert await _role(sid, owner) == "owner"


async def test_routes_require_auth(aclient: httpx.AsyncClient) -> None:
    sid = uuid4()
    for method, path in [
        ("GET", API),
        ("POST", API),
        ("PATCH", f"{API}/{sid}"),
        ("GET", f"{API}/{sid}/members"),
    ]:
        assert (await aclient.request(method, path)).status_code == 401


# --- rename / delete -----------------------------------------------------------------------


async def test_rename_role_matrix(aclient: httpx.AsyncClient, key: TestKey) -> None:
    sid, owner, admin, member, _ = await _setup(aclient, key)
    ok_o = await aclient.patch(
        f"{API}/{sid}", json={"name": " Renamed "}, headers=_auth(key, owner)
    )
    assert ok_o.status_code == 200 and ok_o.json()["name"] == "Renamed"
    ok_a = await aclient.patch(f"{API}/{sid}", json={"name": "By admin"}, headers=_auth(key, admin))
    assert ok_a.status_code == 200 and ok_a.json()["role"] == "admin"
    no = await aclient.patch(f"{API}/{sid}", json={"name": "Nope"}, headers=_auth(key, member))
    assert no.status_code == 403
    bad = await aclient.patch(f"{API}/{sid}", json={"name": " "}, headers=_auth(key, owner))
    assert bad.status_code == 422


async def test_personal_space_cannot_be_renamed_or_deleted(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    u = await _user(aclient, key)
    me = (await aclient.get("/api/v1/me", headers=_auth(key, u))).json()
    pid = me["spaces"][0]["id"]
    assert (
        await aclient.patch(f"{API}/{pid}", json={"name": "x"}, headers=_auth(key, u))
    ).status_code == 409
    assert (await aclient.delete(f"{API}/{pid}", headers=_auth(key, u))).status_code == 409
    assert (await aclient.get(f"{API}/{pid}", headers=_auth(key, u))).status_code == 200


async def test_delete_owner_only_and_cascades(aclient: httpx.AsyncClient, key: TestKey) -> None:
    sid, owner, admin, member, _ = await _setup(aclient, key)
    assert (await aclient.delete(f"{API}/{sid}", headers=_auth(key, admin))).status_code == 403
    assert (await aclient.delete(f"{API}/{sid}", headers=_auth(key, member))).status_code == 403
    assert (await aclient.delete(f"{API}/{sid}", headers=_auth(key, owner))).status_code == 204
    async with db.get_session_ctx() as s:
        spaces = (
            await s.execute(select(func.count()).select_from(Space).where(Space.id == UUID(sid)))
        ).scalar_one()
        members = (
            await s.execute(
                select(func.count())
                .select_from(SpaceMembership)
                .where(SpaceMembership.space_id == UUID(sid))
            )
        ).scalar_one()
    assert (spaces, members) == (0, 0)
    # Users and their personal spaces are untouched; the household is now a 404.
    assert (await aclient.get(f"{API}/{sid}", headers=_auth(key, owner))).status_code == 404
    assert (await aclient.get("/api/v1/me", headers=_auth(key, member))).status_code == 200


# --- members -------------------------------------------------------------------------------


async def test_members_list_for_members_only(aclient: httpx.AsyncClient, key: TestKey) -> None:
    sid, owner, admin, member, stranger = await _setup(aclient, key)
    for who in (owner, admin, member):
        r = await aclient.get(f"{API}/{sid}/members", headers=_auth(key, who))
        assert r.status_code == 200
        items = r.json()["items"]
        assert {i["user_id"] for i in items} == {str(owner), str(admin), str(member)}
        first = items[0]
        assert set(first) == {"user_id", "display_name", "email", "role", "joined_at"}
        assert first["email"].endswith("@example.test")
    assert (
        await aclient.get(f"{API}/{sid}/members", headers=_auth(key, stranger))
    ).status_code == 404
    page = await aclient.get(f"{API}/{sid}/members", params={"limit": 2}, headers=_auth(key, owner))
    assert len(page.json()["items"]) == 2 and page.json()["next_cursor"]
    nxt = await aclient.get(
        f"{API}/{sid}/members",
        params={"limit": 2, "cursor": page.json()["next_cursor"]},
        headers=_auth(key, owner),
    )
    assert len(nxt.json()["items"]) == 1 and nxt.json()["next_cursor"] is None


async def test_change_role_matrix(aclient: httpx.AsyncClient, key: TestKey) -> None:
    sid, owner, admin, member, _ = await _setup(aclient, key)
    url = f"{API}/{sid}/members"
    assert (
        await aclient.patch(f"{url}/{member}", json={"role": "admin"}, headers=_auth(key, admin))
    ).status_code == 403
    assert (
        await aclient.patch(f"{url}/{member}", json={"role": "admin"}, headers=_auth(key, member))
    ).status_code == 403
    assert (
        await aclient.patch(f"{url}/{member}", json={"role": "admin"}, headers=_auth(key, owner))
    ).status_code == 204
    assert await _role(sid, member) == "admin"
    assert (
        await aclient.patch(f"{url}/{member}", json={"role": "member"}, headers=_auth(key, owner))
    ).status_code == 204
    # Cannot mint a second owner, cannot demote the owner, unknown target is 404.
    assert (
        await aclient.patch(f"{url}/{member}", json={"role": "owner"}, headers=_auth(key, owner))
    ).status_code == 422
    assert (
        await aclient.patch(f"{url}/{owner}", json={"role": "admin"}, headers=_auth(key, owner))
    ).status_code == 409
    assert (
        await aclient.patch(f"{url}/{uuid4()}", json={"role": "admin"}, headers=_auth(key, owner))
    ).status_code == 404
    assert (
        await aclient.patch(f"{url}/{member}", json={"role": "boss"}, headers=_auth(key, owner))
    ).status_code == 422


async def test_remove_member_matrix(aclient: httpx.AsyncClient, key: TestKey) -> None:
    sid, owner, admin, member, stranger = await _setup(aclient, key)
    url = f"{API}/{sid}/members"
    # A member cannot remove others; an admin cannot remove an admin or the owner.
    assert (await aclient.delete(f"{url}/{admin}", headers=_auth(key, member))).status_code == 403
    assert (await aclient.delete(f"{url}/{owner}", headers=_auth(key, admin))).status_code == 403
    other_admin = await _user(aclient, key)
    await _add(sid, other_admin, Role.admin)
    assert (
        await aclient.delete(f"{url}/{other_admin}", headers=_auth(key, admin))
    ).status_code == 403
    # A member cannot remove another member either.
    other_member = await _user(aclient, key)
    await _add(sid, other_member, Role.member)
    assert (
        await aclient.delete(f"{url}/{other_member}", headers=_auth(key, member))
    ).status_code == 403
    # Admin removes a member; owner removes an admin.
    assert (await aclient.delete(f"{url}/{member}", headers=_auth(key, admin))).status_code == 204
    assert (
        await aclient.delete(f"{url}/{other_admin}", headers=_auth(key, owner))
    ).status_code == 204
    assert await _role(sid, member) is None
    # A removed user is now a stranger (404); removing a non-member is 404.
    assert (await aclient.get(f"{API}/{sid}", headers=_auth(key, member))).status_code == 404
    assert (await aclient.delete(f"{url}/{stranger}", headers=_auth(key, owner))).status_code == 404


async def test_leave_and_owner_cannot_leave(aclient: httpx.AsyncClient, key: TestKey) -> None:
    sid, owner, admin, member, _ = await _setup(aclient, key)
    url = f"{API}/{sid}/members"
    assert (await aclient.delete(f"{url}/{owner}", headers=_auth(key, owner))).status_code == 409
    assert await _role(sid, owner) == "owner"
    assert (await aclient.delete(f"{url}/{member}", headers=_auth(key, member))).status_code == 204
    assert (await aclient.delete(f"{url}/{admin}", headers=_auth(key, admin))).status_code == 204
    assert (await aclient.get(f"{API}/{sid}", headers=_auth(key, admin))).status_code == 404


async def test_transfer_ownership(aclient: httpx.AsyncClient, key: TestKey) -> None:
    sid, owner, admin, member, stranger = await _setup(aclient, key)
    url = f"{API}/{sid}/transfer-ownership"
    assert (
        await aclient.post(url, json={"user_id": str(member)}, headers=_auth(key, admin))
    ).status_code == 403
    assert (
        await aclient.post(url, json={"user_id": str(stranger)}, headers=_auth(key, owner))
    ).status_code == 404
    assert (
        await aclient.post(url, json={"user_id": str(owner)}, headers=_auth(key, owner))
    ).status_code == 409
    assert (
        await aclient.post(url, json={"user_id": str(member)}, headers=_auth(key, owner))
    ).status_code == 204
    assert await _role(sid, member) == "owner"
    assert await _role(sid, owner) == "admin"
    # Former owner can now leave; the new owner cannot.
    assert (
        await aclient.delete(f"{API}/{sid}/members/{owner}", headers=_auth(key, owner))
    ).status_code == 204
    assert (
        await aclient.delete(f"{API}/{sid}/members/{member}", headers=_auth(key, member))
    ).status_code == 409


async def test_transfer_respects_target_household_cap(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    owner, target = await _user(aclient, key), await _user(aclient, key)
    sid = await _household(aclient, key, owner)
    await _add(sid, target, Role.member)
    for i in range(10):
        await _household(aclient, key, target, f"T{i}")
    r = await aclient.post(
        f"{API}/{sid}/transfer-ownership",
        json={"user_id": str(target)},
        headers=_auth(key, owner),
    )
    assert r.status_code == 409
    assert "10" not in r.json()["detail"]  # does not reveal the target's household count
    assert await _role(sid, owner) == "owner"


# --- owner guard under concurrency ---------------------------------------------------------


async def _owner_count(space_id: str) -> int:
    async with db.get_session_ctx() as s:
        return (
            await s.execute(
                select(func.count())
                .select_from(SpaceMembership)
                .where(SpaceMembership.space_id == UUID(space_id), SpaceMembership.role == "owner")
            )
        ).scalar_one()


async def test_concurrent_transfers_leave_exactly_one_owner(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    sid, owner, admin, member, _ = await _setup(aclient, key)
    url = f"{API}/{sid}/transfer-ownership"
    results = await asyncio.gather(
        aclient.post(url, json={"user_id": str(admin)}, headers=_auth(key, owner)),
        aclient.post(url, json={"user_id": str(member)}, headers=_auth(key, owner)),
    )
    codes = sorted(r.status_code for r in results)
    assert codes == [204, 403]  # the loser is no longer the owner
    assert await _owner_count(sid) == 1


async def test_concurrent_leave_and_transfer_never_orphans_household(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    sid, owner, _admin, member, _ = await _setup(aclient, key)
    results = await asyncio.gather(
        aclient.delete(f"{API}/{sid}/members/{owner}", headers=_auth(key, owner)),
        aclient.post(
            f"{API}/{sid}/transfer-ownership",
            json={"user_id": str(member)},
            headers=_auth(key, owner),
        ),
    )
    leave, transfer = (r.status_code for r in results)
    # The transfer always succeeds. The leave either ran first (owner: 409) or after the
    # transfer, when the caller was already an admin (204). Never two 409s, never an orphan.
    assert transfer == 204
    assert leave in (204, 409)
    assert await _owner_count(sid) == 1
    assert await _role(sid, member) == "owner"


async def test_concurrent_attacks_on_the_owner_keep_owner(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    sid, owner, admin, _member, _ = await _setup(aclient, key)
    results = await asyncio.gather(
        aclient.patch(
            f"{API}/{sid}/members/{owner}", json={"role": "member"}, headers=_auth(key, owner)
        ),
        aclient.delete(f"{API}/{sid}/members/{owner}", headers=_auth(key, admin)),
        aclient.delete(f"{API}/{sid}/members/{owner}", headers=_auth(key, owner)),
    )
    assert [r.status_code for r in results] == [409, 403, 409]
    assert await _owner_count(sid) == 1
    assert await _role(sid, owner) == "owner"


async def test_db_rejects_second_owner(aclient: httpx.AsyncClient, key: TestKey) -> None:
    from sqlalchemy.exc import IntegrityError

    sid, _o, admin, _m, _s = await _setup(aclient, key)
    async with db.get_session_ctx() as s:
        m = (
            await s.execute(
                select(SpaceMembership).where(
                    SpaceMembership.space_id == UUID(sid), SpaceMembership.user_id == admin
                )
            )
        ).scalar_one()
        m.role = Role.owner
        with pytest.raises(IntegrityError):
            await s.commit()
