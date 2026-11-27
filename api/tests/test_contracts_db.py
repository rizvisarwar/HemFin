"""Categories and contracts (DB-backed; runs in CI against Postgres)."""

from datetime import date
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI

from authkit import TestKey
from hemfin.core import db
from hemfin.modules.contracts.router import get_today
from hemfin.modules.spaces.models import Role, SpaceMembership

pytestmark = pytest.mark.db

API = "/api/v1/spaces"
TODAY = date(2026, 11, 27)


@pytest.fixture(autouse=True)
def _pin_today(authed_app: FastAPI) -> None:
    authed_app.dependency_overrides[get_today] = lambda: TODAY


def _auth(key: TestKey, sub: UUID) -> dict[str, str]:
    return {"Authorization": f"Bearer {key.token(sub, f'{sub}@example.test', email_verified=True)}"}


async def _user(c: httpx.AsyncClient, key: TestKey) -> tuple[UUID, dict[str, str]]:
    sub = uuid4()
    h = _auth(key, sub)
    assert (await c.get("/api/v1/me", headers=h)).status_code == 200
    return sub, h


async def _household(c: httpx.AsyncClient, h: dict[str, str]) -> str:
    r = await c.post(API, json={"name": "Home"}, headers=h)
    assert r.status_code == 201, r.text
    return str(r.json()["id"])


async def _add_member(space_id: str, user: UUID) -> None:
    async with db.get_session_ctx() as s:
        s.add(SpaceMembership(space_id=UUID(space_id), user_id=user, role=Role.member))
        await s.commit()


async def _cat(c: httpx.AsyncClient, h: dict[str, str], space: str, key: str) -> str:
    r = await c.get(f"{API}/{space}/categories", headers=h)
    assert r.status_code == 200, r.text
    return next(i["id"] for i in r.json()["items"] if i["key"] == key)


def _body(cat: str, **kw: Any) -> dict[str, Any]:
    return {
        "category_id": cat,
        "name": "Home insurance",
        "provider": "Acme",
        "amount": "42.50",
        "currency": "eur",
        "frequency": "monthly",
        "start_date": "2026-01-31",
        **kw,
    }


async def _make(c: httpx.AsyncClient, h: dict[str, str], space: str, cat: str, **kw: Any) -> dict:
    r = await c.post(f"{API}/{space}/contracts", json=_body(cat, **kw), headers=h)
    assert r.status_code == 201, r.text
    return r.json()


async def test_seeded_categories(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    items = (await aclient.get(f"{API}/{space}/categories", headers=h)).json()["items"]
    keys = {i["key"] for i in items}
    assert {
        "insurance.home",
        "utility.electricity",
        "membership.gym",
        "income.salary",
        "other",
    } <= keys
    assert all(i["system"] for i in items)
    assert next(i for i in items if i["key"] == "insurance.home")["name"] == "Home insurance"


async def test_custom_category_key_is_derived_from_name(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    url = f"{API}/{space}/categories"
    r = await aclient.post(url, json={"name": "  Pet care & vets ", "kind": "expense"}, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["key"] == "pet_care_vets" and r.json()["name"] == "Pet care & vets"
    r = await aclient.post(url, json={"name": "!!!", "kind": "expense"}, headers=h)
    assert r.status_code == 422
    r = await aclient.post(url, json={"name": "x" * 61, "kind": "expense"}, headers=h)
    assert r.status_code == 422


async def test_custom_category_lifecycle(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    url = f"{API}/{space}/categories"
    r = await aclient.post(url, json={"key": "Pets", "name": "Pets", "kind": "expense"}, headers=h)
    assert r.status_code == 201, r.text
    cat = r.json()
    assert cat["key"] == "pets" and cat["system"] is False
    # duplicates (own and system keys) conflict
    for k in ("pets", "insurance.home"):
        dup = await aclient.post(url, json={"key": k, "name": "x", "kind": "expense"}, headers=h)
        assert dup.status_code == 409 and dup.json()["code"] == "category_exists"
    bad_parent = await aclient.post(
        url,
        json={"key": "pets.vet", "name": "Vet", "kind": "income", "parent_key": "pets"},
        headers=h,
    )
    assert bad_parent.status_code == 422
    child = await aclient.post(
        url,
        json={"key": "pets.vet", "name": "Vet", "kind": "expense", "parent_key": "pets"},
        headers=h,
    )
    assert child.status_code == 201
    # a parent with children is in use
    assert (await aclient.delete(f"{url}/{cat['id']}", headers=h)).status_code == 409
    assert (await aclient.delete(f"{url}/{child.json()['id']}", headers=h)).status_code == 204
    assert (await aclient.delete(f"{url}/{cat['id']}", headers=h)).status_code == 204
    assert (await aclient.delete(f"{url}/{cat['id']}", headers=h)).status_code == 404


async def test_system_and_in_use_categories_cannot_be_deleted(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    url = f"{API}/{space}/categories"
    sys_id = await _cat(aclient, h, space, "insurance.home")
    r = await aclient.delete(f"{url}/{sys_id}", headers=h)
    assert r.status_code == 409 and r.json()["code"] == "system_category"
    custom = (
        await aclient.post(url, json={"key": "pets", "name": "Pets", "kind": "expense"}, headers=h)
    ).json()["id"]
    contract = await _make(aclient, h, space, custom)
    r = await aclient.delete(f"{url}/{custom}", headers=h)
    assert r.status_code == 409 and r.json()["code"] == "category_in_use"
    assert (
        await aclient.delete(f"{API}/{space}/contracts/{contract['id']}", headers=h)
    ).status_code == 204
    assert (await aclient.delete(f"{url}/{custom}", headers=h)).status_code == 204


async def test_categories_are_per_space(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, ha = await _user(aclient, key)
    _, hb = await _user(aclient, key)
    sa, sb = await _household(aclient, ha), await _household(aclient, hb)
    custom = (
        await aclient.post(
            f"{API}/{sa}/categories",
            json={"key": "pets", "name": "Pets", "kind": "expense"},
            headers=ha,
        )
    ).json()["id"]
    in_b = (await aclient.get(f"{API}/{sb}/categories", headers=hb)).json()["items"]
    assert "pets" not in {i["key"] for i in in_b}
    # B cannot delete A's category through B's space (404), nor use it on a contract (422)
    assert (await aclient.delete(f"{API}/{sb}/categories/{custom}", headers=hb)).status_code == 404
    r = await aclient.post(f"{API}/{sb}/contracts", json=_body(custom), headers=hb)
    assert r.status_code == 422 and r.headers["content-type"].startswith("application/problem+json")
    # the same key is allowed in another space
    r = await aclient.post(
        f"{API}/{sb}/categories",
        json={"key": "pets", "name": "Pets", "kind": "expense"},
        headers=hb,
    )
    assert r.status_code == 201


async def test_contract_crud_and_schedule(aclient: httpx.AsyncClient, key: TestKey) -> None:
    uid, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "insurance.home")
    c = await _make(aclient, h, space, cat, notes="n")
    assert c["amount"] == "42.50" and c["currency"] == "EUR"
    assert c["category"] == "insurance.home" and c["status"] == "active"
    assert c["created_by"] == str(uid)
    # started Jan 31; as_of Nov 27 -> the next payment clamps to Nov 30
    assert c["schedule"] == {
        "next_payment_date": "2026-11-30",
        "renewal_date": None,
        "notice_deadline": None,
    }
    url = f"{API}/{space}/contracts/{c['id']}"
    assert (await aclient.get(url, headers=h)).json()["id"] == c["id"]

    r = await aclient.patch(
        url,
        json={"auto_renew": True, "notice_period_days": 30, "amount": "50", "provider": None},
        headers=h,
    )
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["amount"] == "50.00" and j["provider"] is None and j["name"] == "Home insurance"
    assert j["schedule"]["renewal_date"] == "2027-01-31"
    assert j["schedule"]["notice_deadline"] == "2027-01-01"

    r = await aclient.patch(url, json={"status": "cancelled"}, headers=h)
    assert r.json()["schedule"] == {
        "next_payment_date": None,
        "renewal_date": None,
        "notice_deadline": None,
    }

    assert (await aclient.delete(url, headers=h)).status_code == 204
    assert (await aclient.get(url, headers=h)).status_code == 404


async def test_amounts_are_strings_never_floats(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "housing.rent")
    jpy = await _make(aclient, h, space, cat, currency="JPY", amount="1200")
    assert jpy["amount"] == "1200"
    page = (await aclient.get(f"{API}/{space}/contracts", headers=h)).json()
    assert all(isinstance(i["amount"], str) for i in page["items"])


@pytest.mark.parametrize(
    "patch",
    [
        {"amount": "0"},
        {"amount": "-5"},
        {"amount": "1.234"},
        {"currency": "JPY"},  # existing amount 42.50 has decimals JPY forbids
        {"currency": "ZZZ"},
        {"end_date": "2026-01-01"},
        {"start_date": "2027-01-01", "end_date": "2026-12-31"},
        {"name": None},
        {"frequency": "daily"},
        {"category_id": str(uuid4())},
        {"member_user_id": str(uuid4())},
    ],
)
async def test_patch_validation_is_problem_json(
    aclient: httpx.AsyncClient, key: TestKey, patch: dict[str, Any]
) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    c = await _make(aclient, h, space, await _cat(aclient, h, space, "insurance.car"))
    r = await aclient.patch(f"{API}/{space}/contracts/{c['id']}", json=patch, headers=h)
    assert r.status_code == 422, r.text
    assert r.headers["content-type"].startswith("application/problem+json")
    assert r.json()["status"] == 422


@pytest.mark.parametrize(
    "bad",
    [
        {"amount": "0"},
        {"amount": "12.345"},
        {"amount": 12.5, "currency": "JPY"},
        {"currency": "XYZ"},
        {"end_date": "2025-01-01"},
        {"category_id": str(uuid4())},
        {"member_user_id": str(uuid4())},
        {"notice_period_days": -1},
    ],
)
async def test_create_validation_is_problem_json(
    aclient: httpx.AsyncClient, key: TestKey, bad: dict[str, Any]
) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "insurance.car")
    r = await aclient.post(f"{API}/{space}/contracts", json=_body(cat, **bad), headers=h)
    assert r.status_code == 422, r.text
    assert r.headers["content-type"].startswith("application/problem+json")


async def test_member_user_must_belong_to_space(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, ha = await _user(aclient, key)
    other, _ = await _user(aclient, key)
    space = await _household(aclient, ha)
    cat = await _cat(aclient, ha, space, "insurance.car")
    r = await aclient.post(
        f"{API}/{space}/contracts", json=_body(cat, member_user_id=str(other)), headers=ha
    )
    assert r.status_code == 422
    await _add_member(space, other)
    r = await aclient.post(
        f"{API}/{space}/contracts", json=_body(cat, member_user_id=str(other)), headers=ha
    )
    assert r.status_code == 201 and r.json()["member_user_id"] == str(other)


async def test_member_of_another_space_is_rejected(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    """Bob really is a member, but of space B only: space A must not accept him."""
    _, ha = await _user(aclient, key)
    bob, hb = await _user(aclient, key)
    sa, sb = await _household(aclient, ha), await _household(aclient, hb)
    cat = await _cat(aclient, ha, sa, "insurance.car")
    url = f"{API}/{sa}/contracts"
    r = await aclient.post(url, json=_body(cat, member_user_id=str(bob)), headers=ha)
    assert r.status_code == 422 and r.json()["code"] == "invalid_member"
    c = await _make(aclient, ha, sa, cat)
    r = await aclient.patch(f"{url}/{c['id']}", json={"member_user_id": str(bob)}, headers=ha)
    assert r.status_code == 422 and r.json()["code"] == "invalid_member"
    # control: Bob is accepted in his own space
    own = await _cat(aclient, hb, sb, "insurance.car")
    r = await aclient.post(
        f"{API}/{sb}/contracts", json=_body(own, member_user_id=str(bob)), headers=hb
    )
    assert r.status_code == 201


async def test_foreign_category_on_patch_is_422(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, ha = await _user(aclient, key)
    _, hb = await _user(aclient, key)
    sa, sb = await _household(aclient, ha), await _household(aclient, hb)
    foreign = (
        await aclient.post(
            f"{API}/{sb}/categories", json={"name": "Secret", "kind": "expense"}, headers=hb
        )
    ).json()["id"]
    c = await _make(aclient, ha, sa, await _cat(aclient, ha, sa, "insurance.car"))
    url = f"{API}/{sa}/contracts/{c['id']}"
    r = await aclient.patch(url, json={"category_id": foreign}, headers=ha)
    assert r.status_code == 422 and r.json()["code"] == "invalid_category"


async def test_income_category_is_rejected_for_contracts(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    income = await _cat(aclient, h, space, "income.salary")
    r = await aclient.post(f"{API}/{space}/contracts", json=_body(income), headers=h)
    assert r.status_code == 422 and r.json()["code"] == "invalid_category"
    c = await _make(aclient, h, space, await _cat(aclient, h, space, "insurance.car"))
    url = f"{API}/{space}/contracts/{c['id']}"
    r = await aclient.patch(url, json={"category_id": income}, headers=h)
    assert r.status_code == 422 and r.json()["code"] == "invalid_category"


async def test_amount_must_be_a_string_and_keep_precision(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "insurance.car")
    url = f"{API}/{space}/contracts"
    for bad in (12.5, 12):
        r = await aclient.post(url, json=_body(cat, amount=bad), headers=h)
        assert r.status_code == 422, bad
    precise = _body(cat, amount="100.0000000000000000000000000001", currency="JPY")
    assert (await aclient.post(url, json=precise, headers=h)).status_code == 422
    c = await _make(aclient, h, space, cat)
    r = await aclient.patch(f"{url}/{c['id']}", json={"amount": 9.99}, headers=h)
    assert r.status_code == 422
    r = await aclient.patch(
        f"{url}/{c['id']}",
        json={"amount": "10.0000000000000000000000000001", "currency": "EUR"},
        headers=h,
    )
    assert r.status_code == 422


async def test_derived_key_prefix_and_collision(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    url = f"{API}/{space}/categories"
    r = await aclient.post(url, json={"name": "3D printing", "kind": "expense"}, headers=h)
    assert r.status_code == 201 and r.json()["key"] == "c_3d_printing"
    # "Food" derives the system key `food`
    r = await aclient.post(url, json={"name": "Food", "kind": "expense"}, headers=h)
    assert r.status_code == 409 and r.json()["code"] == "category_exists"


async def test_upcoming_limit_and_has_more(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "utility.gas")
    await _make(aclient, h, space, cat, name="Weekly", frequency="weekly", start_date="2026-01-01")
    url = f"{API}/{space}/contracts/upcoming"
    r = (await aclient.get(url, params={"days": 60, "limit": 3}, headers=h)).json()
    assert len(r["items"]) == 3 and r["has_more"] is True
    r = (await aclient.get(url, params={"days": 7}, headers=h)).json()
    assert len(r["items"]) <= 2 and r["has_more"] is False
    for bad in (0, 201):
        assert (await aclient.get(url, params={"limit": bad}, headers=h)).status_code == 422


async def test_any_member_can_read_and_write(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, ha = await _user(aclient, key)
    bob, hb = await _user(aclient, key)
    space = await _household(aclient, ha)
    await _add_member(space, bob)
    cat = await _cat(aclient, hb, space, "utility.gas")
    c = await _make(aclient, hb, space, cat)
    r = await aclient.patch(f"{API}/{space}/contracts/{c['id']}", json={"name": "Gas"}, headers=ha)
    assert r.status_code == 200 and r.json()["name"] == "Gas"


async def test_list_filters_and_pagination(aclient: httpx.AsyncClient, key: TestKey) -> None:
    uid, h = await _user(aclient, key)
    space = await _household(aclient, h)
    home = await _cat(aclient, h, space, "insurance.home")
    car = await _cat(aclient, h, space, "insurance.car")
    gym = await _cat(aclient, h, space, "membership.gym")
    made = [
        await _make(aclient, h, space, home, name="a"),
        await _make(aclient, h, space, car, name="b", member_user_id=str(uid)),
        await _make(aclient, h, space, gym, name="c"),
        await _make(aclient, h, space, gym, name="d"),
        await _make(aclient, h, space, gym, name="e"),
    ]
    await aclient.patch(
        f"{API}/{space}/contracts/{made[4]['id']}", json={"status": "cancelled"}, headers=h
    )
    url = f"{API}/{space}/contracts"

    seen: list[str] = []
    cursor: str | None = None
    for _ in range(5):
        params: dict[str, Any] = {"limit": 2}
        if cursor:
            params["cursor"] = cursor
        page = (await aclient.get(url, params=params, headers=h)).json()
        seen += [i["name"] for i in page["items"]]
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert seen == ["a", "b", "c", "d", "e"]

    async def names(**p: Any) -> list[str]:
        return [i["name"] for i in (await aclient.get(url, params=p, headers=h)).json()["items"]]

    assert await names(category="insurance.home") == ["a"]
    assert await names(category="insurance") == ["a", "b"]  # group includes children
    assert await names(category="insur") == []  # no partial matches
    assert await names(status="cancelled") == ["e"]
    assert await names(member_user_id=str(uid)) == ["b"]
    assert await names(member_user_id="none") == ["a", "c", "d", "e"]  # whole household
    assert (
        await aclient.get(url, params={"member_user_id": "someone"}, headers=h)
    ).status_code == 422
    assert (await aclient.get(url, params={"cursor": "garbage"}, headers=h)).status_code == 422
    assert (await aclient.get(url, params={"status": "weird"}, headers=h)).status_code == 422


async def test_upcoming(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "subscription.streaming")
    await _make(aclient, h, space, cat, name="Stream", start_date="2026-01-31")  # Nov 30
    await _make(
        aclient,
        h,
        space,
        cat,
        name="Annual",
        frequency="annual",
        start_date="2026-01-05",
        auto_renew=True,
        notice_period_days=30,
        currency="USD",
        amount="99",
    )
    cancelled = await _make(aclient, h, space, cat, name="Gone")
    await aclient.patch(
        f"{API}/{space}/contracts/{cancelled['id']}", json={"status": "cancelled"}, headers=h
    )
    r = await aclient.get(f"{API}/{space}/contracts/upcoming", params={"days": 60}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["as_of"] == "2026-11-27" and body["until"] == "2027-01-26"
    got = [(i["date"], i["type"], i["contract_name"]) for i in body["items"]]
    assert got == [
        ("2026-11-30", "payment", "Stream"),
        ("2026-12-06", "notice_deadline", "Annual"),
        ("2026-12-31", "payment", "Stream"),
        ("2027-01-05", "payment", "Annual"),
        ("2027-01-05", "renewal", "Annual"),
    ]  # Stream's Jan 31 payment is beyond `until`
    first = body["items"][0]
    assert first["amount"] == {"amount": "42.50", "currency": "EUR"} and first["contract_id"]
    usd = next(i for i in body["items"] if i["contract_name"] == "Annual")
    assert usd["amount"] == {"amount": "99.00", "currency": "USD"}


@pytest.mark.parametrize("days", [0, 367, -1, "x"])
async def test_upcoming_days_bounds(aclient: httpx.AsyncClient, key: TestKey, days: Any) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    r = await aclient.get(f"{API}/{space}/contracts/upcoming", params={"days": days}, headers=h)
    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/problem+json")


async def test_upcoming_days_limits_ok(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    for d in (1, 366):
        r = await aclient.get(f"{API}/{space}/contracts/upcoming", params={"days": d}, headers=h)
        assert r.status_code == 200 and r.json()["items"] == []


async def test_stranger_gets_404_everywhere(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, ha = await _user(aclient, key)
    _, hs = await _user(aclient, key)
    space = await _household(aclient, ha)
    cat = await _cat(aclient, ha, space, "insurance.home")
    c = await _make(aclient, ha, space, cat)
    base = f"{API}/{space}"
    calls = [
        ("GET", f"{base}/categories", None),
        ("POST", f"{base}/categories", {"key": "x", "name": "X", "kind": "expense"}),
        ("DELETE", f"{base}/categories/{cat}", None),
        ("GET", f"{base}/contracts", None),
        ("POST", f"{base}/contracts", _body(cat)),
        ("GET", f"{base}/contracts/upcoming", None),
        ("GET", f"{base}/contracts/{c['id']}", None),
        ("PATCH", f"{base}/contracts/{c['id']}", {"name": "x"}),
        ("DELETE", f"{base}/contracts/{c['id']}", None),
    ]
    for method, url, json in calls:
        r = await aclient.request(method, url, json=json, headers=hs)
        assert r.status_code == 404, (method, url, r.status_code)
        assert r.headers["content-type"].startswith("application/problem+json")
    # nothing was changed
    assert (await aclient.get(f"{base}/contracts/{c['id']}", headers=ha)).json()["name"] == c[
        "name"
    ]


async def test_contract_id_from_another_space_is_404(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, ha = await _user(aclient, key)
    _, hb = await _user(aclient, key)
    sa, sb = await _household(aclient, ha), await _household(aclient, hb)
    c = await _make(aclient, ha, sa, await _cat(aclient, ha, sa, "insurance.home"))
    for method, json in (("GET", None), ("PATCH", {"name": "x"}), ("DELETE", None)):
        r = await aclient.request(method, f"{API}/{sb}/contracts/{c['id']}", json=json, headers=hb)
        assert r.status_code == 404, method
    assert (await aclient.get(f"{API}/{sb}/contracts", headers=hb)).json()["items"] == []
    assert (await aclient.get(f"{API}/{sa}/contracts/{c['id']}", headers=ha)).status_code == 200


async def test_unauthenticated_is_401(aclient: httpx.AsyncClient) -> None:
    r = await aclient.get(f"{API}/{uuid4()}/contracts")
    assert r.status_code == 401
