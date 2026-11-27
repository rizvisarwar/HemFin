"""Expenses and income (DB-backed; runs in CI against Postgres)."""

from datetime import date
from decimal import Decimal
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
TODAY = date(2040, 6, 15)


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
    return next(i["id"] for i in r.json()["items"] if i["key"] == key)


def _exp(cat: str, **kw: Any) -> dict[str, Any]:
    return {
        "category_id": cat,
        "amount": "12.50",
        "spent_on": "2040-06-10",
        **kw,
    }


async def _mk_expense(
    c: httpx.AsyncClient, h: dict[str, str], space: str, cat: str, **kw: Any
) -> dict:
    r = await c.post(f"{API}/{space}/expenses", json=_exp(cat, **kw), headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _entry(**kw: Any) -> dict[str, Any]:
    return {"amount": "1000.00", "received_on": "2040-06-10", **kw}


def _source(**kw: Any) -> dict[str, Any]:
    return {"name": "Salary", "type": "salary", "amount": "3000",
            "frequency": "monthly", **kw}  # fmt: skip


# ---- expenses ----


async def test_expense_crud_and_decimal_round_trip(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "food")
    url = f"{API}/{space}/expenses"
    # 0.1 and 0.2 come back exactly, and no float sneaks in
    a = await _mk_expense(aclient, h, space, cat, amount="0.1", merchant="  Shop ", description="x")
    b = await _mk_expense(aclient, h, space, cat, amount="0.2")
    assert (a["amount"], b["amount"], a["currency"]) == ("0.10", "0.20", "SEK")
    assert Decimal(a["amount"]) + Decimal(b["amount"]) == Decimal("0.30")
    assert a["merchant"] == "Shop" and a["category"] == "food"
    assert a["space_id"] == space and a["contract_id"] is None
    # the largest amount, and a client-sent currency is ignored
    j = await _mk_expense(aclient, h, space, cat, amount="99999999999999", currency="JPY")
    assert j["amount"] == "99999999999999.00" and j["currency"] == "SEK"
    assert "base_amount" not in j

    got = await aclient.get(f"{url}/{a['id']}", headers=h)
    assert got.status_code == 200 and got.json()["amount"] == "0.10"

    p = await aclient.patch(
        f"{url}/{a['id']}",
        json={"amount": "33.30", "merchant": None, "description": "y"},
        headers=h,
    )
    assert p.status_code == 200, p.text
    assert (p.json()["amount"], p.json()["merchant"], p.json()["description"]) == (
        "33.30",
        None,
        "y",
    )
    assert (await aclient.delete(f"{url}/{a['id']}", headers=h)).status_code == 204
    assert (await aclient.get(f"{url}/{a['id']}", headers=h)).status_code == 404


async def test_expense_validation(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "food")
    url = f"{API}/{space}/expenses"
    bad = [
        {"amount": 12.5},  # JSON number
        {"amount": "0"},
        {"amount": "-1"},
        {"amount": "1.234"},  # too many decimals
        {"amount": "12,50"},  # decimal comma is a web-side input format only
        {"spent_on": "1800-01-01"},
        {"description": "d" * 121},
        {"merchant": "m" * 81},
    ]
    for kw in bad:
        r = await aclient.post(url, json=_exp(cat, **kw), headers=h)
        assert r.status_code == 422, (kw, r.status_code)
        assert r.headers["content-type"].startswith("application/problem+json")
    e = await _mk_expense(aclient, h, space, cat)
    r = await aclient.patch(f"{url}/{e['id']}", json={"currency": "USD"}, headers=h)
    assert r.status_code == 200 and r.json()["currency"] == "SEK"
    for field in ("amount", "category_id", "spent_on"):
        r = await aclient.patch(f"{url}/{e['id']}", json={field: None}, headers=h)
        assert r.status_code == 422, field


async def test_expense_date_may_be_at_most_one_day_ahead(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "food")
    url = f"{API}/{space}/expenses"
    ok = await _mk_expense(aclient, h, space, cat, spent_on="2040-06-16")
    assert ok["spent_on"] == "2040-06-16"
    r = await aclient.post(url, json=_exp(cat, spent_on="2040-06-17"), headers=h)
    assert r.status_code == 422 and r.json()["code"] == "date_in_future"
    r = await aclient.patch(f"{url}/{ok['id']}", json={"spent_on": "2040-06-17"}, headers=h)
    assert r.status_code == 422 and r.json()["code"] == "date_in_future"
    r = await aclient.patch(f"{url}/{ok['id']}", json={"spent_on": "2040-06-15"}, headers=h)
    assert r.status_code == 200


async def test_expense_refs_must_belong_to_the_space(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, ha = await _user(aclient, key)
    ub, hb = await _user(aclient, key)
    sa, sb = await _household(aclient, ha), await _household(aclient, hb)
    cat_a = await _cat(aclient, ha, sa, "food")
    income_cat = await _cat(aclient, ha, sa, "income.salary")
    custom_b = (
        await aclient.post(
            f"{API}/{sb}/categories",
            json={"key": "mine", "name": "Mine", "kind": "expense"},
            headers=hb,
        )
    ).json()["id"]
    contract_b = (
        await aclient.post(
            f"{API}/{sb}/contracts",
            json={
                "category_id": await _cat(aclient, hb, sb, "insurance.home"),
                "name": "C",
                "amount": "5",
                "frequency": "monthly",
                "start_date": "2040-01-01",
            },
            headers=hb,
        )
    ).json()["id"]
    url = f"{API}/{sa}/expenses"
    cases = [
        ({"category_id": custom_b}, "invalid_category"),
        ({"category_id": income_cat}, "invalid_category"),
        ({"category_id": str(uuid4())}, "invalid_category"),
        ({"contract_id": contract_b}, "invalid_contract"),
        ({"member_user_id": str(ub)}, "invalid_member"),
    ]
    for kw, code in cases:
        r = await aclient.post(url, json=_exp(cat_a, **kw), headers=ha)
        assert r.status_code == 422 and r.json()["code"] == code, (kw, r.text)
        e = await _mk_expense(aclient, ha, sa, cat_a)
        r = await aclient.patch(f"{url}/{e['id']}", json=kw, headers=ha)
        assert r.status_code == 422 and r.json()["code"] == code, (kw, r.text)
    # once B joins A's space, B is a valid member
    await _add_member(sa, ub)
    assert (await _mk_expense(aclient, ha, sa, cat_a, member_user_id=str(ub)))[
        "member_user_id"
    ] == str(ub)


async def test_expense_filters_boundaries_and_pagination(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    ua, ha = await _user(aclient, key)
    space = await _household(aclient, ha)
    groceries = await _cat(aclient, ha, space, "food")
    other = await _cat(aclient, ha, space, "insurance.home")
    contract = (
        await aclient.post(
            f"{API}/{space}/contracts",
            json={
                "category_id": other,
                "name": "C",
                "amount": "5",
                "frequency": "monthly",
                "start_date": "2040-01-01",
            },
            headers=ha,
        )
    ).json()["id"]
    days = ["2040-06-01", "2040-06-02", "2040-06-02", "2040-06-03", "2040-06-04"]
    made = [
        await _mk_expense(aclient, ha, space, groceries, spent_on=d, amount=f"{i + 1}.00")
        for i, d in enumerate(days)
    ]
    linked = await _mk_expense(
        aclient,
        ha,
        space,
        other,
        spent_on="2040-06-05",
        contract_id=contract,
        member_user_id=str(ua),
    )
    url = f"{API}/{space}/expenses"

    async def ids(**params: Any) -> list[str]:
        r = await aclient.get(url, params=params, headers=ha)
        assert r.status_code == 200, r.text
        return [i["id"] for i in r.json()["items"]]

    # inclusive on both ends
    assert set(await ids(**{"from": "2040-06-02", "to": "2040-06-03"})) == {
        made[1]["id"],
        made[2]["id"],
        made[3]["id"],
    }
    assert await ids(**{"from": "2040-06-05"}) == [linked["id"]]
    assert set(await ids(to="2040-06-01")) == {made[0]["id"]}
    assert await ids(**{"from": "2040-06-06"}) == []
    assert await ids(contract_id=contract) == [linked["id"]]
    assert await ids(member_user_id=str(ua)) == [linked["id"]]
    # `none` is the whole household: the five unassigned expenses, not the member's one
    assert {m["id"] for m in made} == set(await ids(member_user_id="none"))
    r = await aclient.get(url, params={"member_user_id": "someone"}, headers=ha)
    assert r.status_code == 422
    assert r.json()["code"] == "invalid_member_filter"
    assert await ids(category="insurance") == [linked["id"]]  # group key includes children
    assert len(await ids(category="food")) == 5
    assert await ids(category="food.groc") == []  # no partial-key matches

    # newest date first, then pages of 2 with no gaps or repeats (ties on the same date)
    everything = await ids()
    assert everything[0] == linked["id"] and len(everything) == 6
    seen: list[str] = []
    cursor: str | None = None
    for _ in range(5):
        params: dict[str, Any] = {"limit": 2}
        if cursor:
            params["cursor"] = cursor
        r = await aclient.get(url, params=params, headers=ha)
        body = r.json()
        seen += [i["id"] for i in body["items"]]
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert seen == everything
    r = await aclient.get(url, params={"cursor": "garbage"}, headers=ha)
    assert r.status_code == 422


async def test_category_in_use_by_expense_cannot_be_deleted(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    custom = (
        await aclient.post(
            f"{API}/{space}/categories",
            json={"key": "mine", "name": "Mine", "kind": "expense"},
            headers=h,
        )
    ).json()["id"]
    e = await _mk_expense(aclient, h, space, custom)
    cat_url = f"{API}/{space}/categories/{custom}"
    assert (await aclient.delete(cat_url, headers=h)).status_code == 409
    assert (await aclient.delete(f"{API}/{space}/expenses/{e['id']}", headers=h)).status_code == 204
    assert (await aclient.delete(cat_url, headers=h)).status_code == 204


async def test_deleting_a_contract_keeps_its_expenses(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    contract = (
        await aclient.post(
            f"{API}/{space}/contracts",
            json={
                "category_id": await _cat(aclient, h, space, "insurance.home"),
                "name": "C",
                "amount": "5",
                "frequency": "monthly",
                "start_date": "2040-01-01",
            },
            headers=h,
        )
    ).json()["id"]
    e = await _mk_expense(
        aclient, h, space, await _cat(aclient, h, space, "food"), contract_id=contract
    )
    assert (
        await aclient.delete(f"{API}/{space}/contracts/{contract}", headers=h)
    ).status_code == 204
    got = await aclient.get(f"{API}/{space}/expenses/{e['id']}", headers=h)
    assert got.status_code == 200 and got.json()["contract_id"] is None


# ---- income sources ----


async def test_income_source_crud_and_pagination(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    url = f"{API}/{space}/income-sources"
    s = await aclient.post(url, json=_source(amount="0.1", frequency="irregular"), headers=h)
    assert s.status_code == 201, s.text
    body = s.json()
    assert (body["amount"], body["frequency"], body["active"], body["type"]) == (
        "0.10",
        "irregular",
        True,
        "salary",
    )
    p = await aclient.patch(
        f"{url}/{body['id']}",
        json={"active": False, "type": "business", "amount": "0.30"},
        headers=h,
    )
    assert p.status_code == 200 and p.json()["active"] is False and p.json()["amount"] == "0.30"
    assert p.json()["type"] == "business"
    for bad in (
        {"type": "gift"},
        {"frequency": "daily"},
        {"amount": 5},
        {"amount": "0"},
        {"name": ""},
    ):
        r = await aclient.post(url, json=_source(**bad), headers=h)
        assert r.status_code == 422, bad
    for field in ("name", "type", "amount", "frequency", "active"):
        r = await aclient.patch(f"{url}/{body['id']}", json={field: None}, headers=h)
        assert r.status_code == 422, field
    made = [body["id"]]
    for i in range(4):
        made.append((await aclient.post(url, json=_source(name=f"S{i}"), headers=h)).json()["id"])
    seen: list[str] = []
    cursor: str | None = None
    for _ in range(5):
        params: dict[str, Any] = {"limit": 2}
        if cursor:
            params["cursor"] = cursor
        page = (await aclient.get(url, params=params, headers=h)).json()
        seen += [i["id"] for i in page["items"]]
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert seen == made[::-1]  # newest first, nothing missing or repeated
    assert (await aclient.delete(f"{url}/{body['id']}", headers=h)).status_code == 204
    assert (await aclient.get(f"{url}/{body['id']}", headers=h)).status_code == 404


async def test_income_source_member_must_belong_to_the_space(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, ha = await _user(aclient, key)
    ub, _ = await _user(aclient, key)
    space = await _household(aclient, ha)
    url = f"{API}/{space}/income-sources"
    r = await aclient.post(url, json=_source(member_user_id=str(ub)), headers=ha)
    assert r.status_code == 422 and r.json()["code"] == "invalid_member"
    s = (await aclient.post(url, json=_source(), headers=ha)).json()
    r = await aclient.patch(f"{url}/{s['id']}", json={"member_user_id": str(ub)}, headers=ha)
    assert r.status_code == 422 and r.json()["code"] == "invalid_member"
    await _add_member(space, ub)
    r = await aclient.patch(f"{url}/{s['id']}", json={"member_user_id": str(ub)}, headers=ha)
    assert r.status_code == 200 and r.json()["member_user_id"] == str(ub)
    r = await aclient.patch(f"{url}/{s['id']}", json={"member_user_id": None}, headers=ha)
    assert r.status_code == 200 and r.json()["member_user_id"] is None


# ---- income entries ----


async def test_income_entry_crud_and_dates(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    url = f"{API}/{space}/income-entries"
    r = await aclient.post(url, json=_entry(amount="0.1", description=" pay "), headers=h)
    assert r.status_code == 201, r.text
    e = r.json()
    assert (e["amount"], e["description"], e["source_id"]) == ("0.10", "pay", None)
    assert e["currency"] == "SEK" and "base_amount" not in e
    usd = (await aclient.post(url, json=_entry(amount="100", currency="USD"), headers=h)).json()
    assert usd["currency"] == "SEK"  # a client-sent currency is ignored

    assert (
        await aclient.post(url, json=_entry(received_on="2040-06-16"), headers=h)
    ).status_code == 201
    r = await aclient.post(url, json=_entry(received_on="2040-06-17"), headers=h)
    assert r.status_code == 422 and r.json()["code"] == "date_in_future"
    r = await aclient.patch(f"{url}/{e['id']}", json={"received_on": "2040-06-17"}, headers=h)
    assert r.status_code == 422 and r.json()["code"] == "date_in_future"
    for bad in ({"amount": 1.5}, {"amount": "-3"}, {"description": "d" * 121}):
        assert (await aclient.post(url, json=_entry(**bad), headers=h)).status_code == 422, bad
    for field in ("amount", "received_on"):
        r = await aclient.patch(f"{url}/{e['id']}", json={field: None}, headers=h)
        assert r.status_code == 422, field
    p = await aclient.patch(
        f"{url}/{e['id']}", json={"amount": "0.30", "description": None}, headers=h
    )
    assert p.status_code == 200 and p.json()["amount"] == "0.30" and p.json()["description"] is None
    assert (await aclient.delete(f"{url}/{e['id']}", headers=h)).status_code == 204
    assert (await aclient.get(f"{url}/{e['id']}", headers=h)).status_code == 404


async def test_income_entry_refs_filters_and_pagination(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, ha = await _user(aclient, key)
    ub, hb = await _user(aclient, key)
    sa, sb = await _household(aclient, ha), await _household(aclient, hb)
    src_a = (await aclient.post(f"{API}/{sa}/income-sources", json=_source(), headers=ha)).json()[
        "id"
    ]
    src_b = (await aclient.post(f"{API}/{sb}/income-sources", json=_source(), headers=hb)).json()[
        "id"
    ]
    url = f"{API}/{sa}/income-entries"
    r = await aclient.post(url, json=_entry(source_id=src_b), headers=ha)
    assert r.status_code == 422 and r.json()["code"] == "invalid_source"
    r = await aclient.post(url, json=_entry(member_user_id=str(ub)), headers=ha)
    assert r.status_code == 422 and r.json()["code"] == "invalid_member"
    e0 = (await aclient.post(url, json=_entry(), headers=ha)).json()
    r = await aclient.patch(f"{url}/{e0['id']}", json={"source_id": src_b}, headers=ha)
    assert r.status_code == 422 and r.json()["code"] == "invalid_source"

    days = ["2040-06-01", "2040-06-02", "2040-06-02", "2040-06-03", "2040-06-04"]
    made = [
        (
            await aclient.post(
                url, json=_entry(received_on=d, source_id=src_a if i % 2 == 0 else None), headers=ha
            )
        ).json()
        for i, d in enumerate(days)
    ]

    async def ids(**params: Any) -> list[str]:
        r = await aclient.get(url, params=params, headers=ha)
        assert r.status_code == 200, r.text
        return [i["id"] for i in r.json()["items"]]

    assert set(await ids(**{"from": "2040-06-02", "to": "2040-06-03"})) == {
        made[1]["id"],
        made[2]["id"],
        made[3]["id"],
    }
    assert set(await ids(to="2040-06-01")) == {made[0]["id"]}
    assert await ids(**{"from": "2040-06-11"}) == []
    assert set(await ids(source_id=src_a)) == {made[0]["id"], made[2]["id"], made[4]["id"]}
    everything = await ids()
    assert everything[0] == e0["id"] and len(everything) == 6  # 2040-06-10 first
    seen: list[str] = []
    cursor: str | None = None
    for _ in range(5):
        params: dict[str, Any] = {"limit": 2}
        if cursor:
            params["cursor"] = cursor
        body = (await aclient.get(url, params=params, headers=ha)).json()
        seen += [i["id"] for i in body["items"]]
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert seen == everything

    # deleting a source keeps its entries
    assert (
        await aclient.delete(f"{API}/{sa}/income-sources/{src_a}", headers=ha)
    ).status_code == 204
    got = await aclient.get(f"{url}/{made[0]['id']}", headers=ha)
    assert got.status_code == 200 and got.json()["source_id"] is None


# ---- isolation ----


async def test_stranger_gets_404_everywhere(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, ha = await _user(aclient, key)
    _, hs = await _user(aclient, key)
    space = await _household(aclient, ha)
    cat = await _cat(aclient, ha, space, "food")
    e = await _mk_expense(aclient, ha, space, cat)
    src = (await aclient.post(f"{API}/{space}/income-sources", json=_source(), headers=ha)).json()
    ent = (await aclient.post(f"{API}/{space}/income-entries", json=_entry(), headers=ha)).json()
    b = f"{API}/{space}"
    calls = [
        ("GET", f"{b}/expenses", None),
        ("POST", f"{b}/expenses", _exp(cat)),
        ("GET", f"{b}/expenses/{e['id']}", None),
        ("PATCH", f"{b}/expenses/{e['id']}", {"merchant": "x"}),
        ("DELETE", f"{b}/expenses/{e['id']}", None),
        ("GET", f"{b}/income-sources", None),
        ("POST", f"{b}/income-sources", _source()),
        ("GET", f"{b}/income-sources/{src['id']}", None),
        ("PATCH", f"{b}/income-sources/{src['id']}", {"name": "x"}),
        ("DELETE", f"{b}/income-sources/{src['id']}", None),
        ("GET", f"{b}/income-entries", None),
        ("POST", f"{b}/income-entries", _entry()),
        ("GET", f"{b}/income-entries/{ent['id']}", None),
        ("PATCH", f"{b}/income-entries/{ent['id']}", {"description": "x"}),
        ("DELETE", f"{b}/income-entries/{ent['id']}", None),
    ]
    for method, url, json in calls:
        r = await aclient.request(method, url, json=json, headers=hs)
        assert r.status_code == 404, (method, url, r.status_code)
        assert r.headers["content-type"].startswith("application/problem+json")
    # nothing changed
    assert (await aclient.get(f"{b}/expenses/{e['id']}", headers=ha)).json()["merchant"] is None
    assert (await aclient.get(f"{b}/income-sources/{src['id']}", headers=ha)).status_code == 200
    assert (await aclient.get(f"{b}/income-entries/{ent['id']}", headers=ha)).status_code == 200


async def test_ids_from_another_space_are_404(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, ha = await _user(aclient, key)
    _, hb = await _user(aclient, key)
    sa, sb = await _household(aclient, ha), await _household(aclient, hb)
    e = await _mk_expense(aclient, ha, sa, await _cat(aclient, ha, sa, "food"))
    src = (await aclient.post(f"{API}/{sa}/income-sources", json=_source(), headers=ha)).json()
    ent = (await aclient.post(f"{API}/{sa}/income-entries", json=_entry(), headers=ha)).json()
    for kind, rec, patch in (
        ("expenses", e, {"merchant": "x"}),
        ("income-sources", src, {"name": "x"}),
        ("income-entries", ent, {"description": "x"}),
    ):
        for method, json in (("GET", None), ("PATCH", patch), ("DELETE", None)):
            r = await aclient.request(
                method, f"{API}/{sb}/{kind}/{rec['id']}", json=json, headers=hb
            )
            assert r.status_code == 404, (kind, method)
        assert (await aclient.get(f"{API}/{sb}/{kind}", headers=hb)).json()["items"] == []
        assert (await aclient.get(f"{API}/{sa}/{kind}/{rec['id']}", headers=ha)).status_code == 200


async def test_unauthenticated_is_401(aclient: httpx.AsyncClient) -> None:
    for kind in ("expenses", "income-sources", "income-entries"):
        assert (await aclient.get(f"{API}/{uuid4()}/{kind}")).status_code == 401
