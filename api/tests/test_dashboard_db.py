"""Dashboard summary (DB-backed; runs in CI against Postgres)."""

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
from hemfin.modules.contracts.schedule import Frequency
from hemfin.modules.dashboard.service import monthly_amount
from hemfin.modules.expenses.models import Expense

pytestmark = pytest.mark.db

API = "/api/v1/spaces"
TODAY = date(2041, 7, 5)
MONTH = "2041-06"


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


async def _cat(c: httpx.AsyncClient, h: dict[str, str], space: str, key: str) -> str:
    r = await c.get(f"{API}/{space}/categories", headers=h)
    return next(i["id"] for i in r.json()["items"] if i["key"] == key)


async def _foreign_expense(space: str, user: UUID, cat: str) -> None:
    """A row in another currency, as demo use left them. Not creatable via the API."""
    async with db.get_session_ctx() as s:
        s.add(
            Expense(
                space_id=UUID(space),
                created_by=user,
                category_id=UUID(cat),
                amount=Decimal("500.00"),
                currency="EUR",
                spent_on=date(2041, 6, 10),
            )
        )
        await s.commit()


async def _expense(
    c: httpx.AsyncClient, h: dict[str, str], space: str, cat: str, spent_on: str, **kw: Any
) -> None:
    body = {"category_id": cat, "amount": "10.00", "spent_on": spent_on, **kw}
    r = await c.post(f"{API}/{space}/expenses", json=body, headers=h)
    assert r.status_code == 201, r.text


async def _income(
    c: httpx.AsyncClient, h: dict[str, str], space: str, received_on: str, **kw: Any
) -> None:
    body = {"amount": "100.00", "received_on": received_on, **kw}
    r = await c.post(f"{API}/{space}/income-entries", json=body, headers=h)
    assert r.status_code == 201, r.text


async def _contract(
    c: httpx.AsyncClient, h: dict[str, str], space: str, cat: str, **kw: Any
) -> dict:
    body = {
        "category_id": cat,
        "name": "Contract",
        "amount": "10.00",
        "frequency": "monthly",
        "start_date": "2041-01-01",
        **kw,
    }
    r = await c.post(f"{API}/{space}/contracts", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


async def _get(
    c: httpx.AsyncClient, h: dict[str, str], space: str, month: str | None = MONTH
) -> Any:
    params = {"month": month} if month else {}
    r = await c.get(f"{API}/{space}/dashboard", params=params, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _m(amount: str, currency: str = "SEK") -> dict[str, str]:
    return {"amount": amount, "currency": currency}


def test_monthly_amount_each_frequency() -> None:
    a = Decimal("120")
    assert monthly_amount(a, Frequency.weekly) == Decimal("520")
    assert monthly_amount(a, Frequency.monthly) == Decimal("120")
    assert monthly_amount(a, Frequency.quarterly) == Decimal("40")
    assert monthly_amount(a, Frequency.semiannual) == Decimal("20")
    assert monthly_amount(a, Frequency.annual) == Decimal("10")


async def test_empty_space_is_zeros(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    body = await _get(aclient, h, space, month=None)  # default is today's UTC month
    assert body == {
        "month": "2041-07",
        "spent_this_month": _m("0.00"),
        "recurring_monthly": _m("0.00"),
        "income_this_month": _m("0.00"),
        "upcoming": [],
        "has_records": False,
    }


async def test_month_boundaries_and_foreign_rows_excluded(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    uid, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "food")
    # month boundaries: first and last day count, the days either side do not
    await _expense(aclient, h, space, cat, "2041-05-31", amount="1000")
    await _expense(aclient, h, space, cat, "2041-06-01")
    await _expense(aclient, h, space, cat, "2041-06-30", amount="25.50")
    await _expense(aclient, h, space, cat, "2041-07-01", amount="1000")
    await _foreign_expense(space, uid, cat)  # EUR: left out of the totals
    await _income(aclient, h, space, "2041-05-31", amount="999")
    await _income(aclient, h, space, "2041-06-01", amount="1000.00")
    await _income(aclient, h, space, "2041-06-30", amount="10.25")
    await _income(aclient, h, space, "2041-07-01", amount="999")
    body = await _get(aclient, h, space)
    assert body["spent_this_month"] == _m("35.50")
    assert body["income_this_month"] == _m("1010.25")
    assert body["recurring_monthly"] == _m("0.00")
    assert "base_currency" not in body and "unconverted_count" not in body
    # another month is separate
    may = await _get(aclient, h, space, month="2041-05")
    assert may["spent_this_month"] == _m("1000.00")
    assert may["income_this_month"] == _m("999.00")


async def test_recurring_normalisation_and_active_only(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "insurance")
    await _contract(aclient, h, space, cat, frequency="weekly", amount="52.00")  # 225.3333
    await _contract(aclient, h, space, cat, frequency="monthly", amount="10.00")  # 10
    await _contract(aclient, h, space, cat, frequency="quarterly", amount="30.00")  # 10
    await _contract(aclient, h, space, cat, frequency="semiannual", amount="60.00")  # 10
    await _contract(aclient, h, space, cat, frequency="annual", amount="120.00")  # 10
    gone = await _contract(aclient, h, space, cat, amount="999.00")
    patched = await aclient.patch(
        f"{API}/{space}/contracts/{gone['id']}", json={"status": "cancelled"}, headers=h
    )
    assert patched.status_code == 200
    body = await _get(aclient, h, space)
    # 225.3333.. + 10 x 4, rounded once
    assert body["recurring_monthly"] == _m("265.33")


async def test_rounds_once_per_total(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "insurance")
    for _ in range(3):  # each is 0.0033.. a month: rounding per item would give 0.00
        await _contract(aclient, h, space, cat, frequency="annual", amount="0.04")
    body = await _get(aclient, h, space)
    assert body["recurring_monthly"] == _m("0.01")


async def test_upcoming_events(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "insurance")
    one = await _contract(
        aclient,
        h,
        space,
        cat,
        name="Insurance",
        amount="42.50",
        start_date="2041-07-10",
        end_date="2041-08-01",
        auto_renew=True,
        renewal_term_months=12,
        notice_period_days=5,
    )
    body = await _get(aclient, h, space)
    kinds = [(e["type"], e["date"]) for e in body["upcoming"]]
    assert kinds == [
        ("payment", "2041-07-10"),
        ("notice_deadline", "2041-07-27"),
        ("renewal", "2041-08-01"),
    ]
    first = body["upcoming"][0]
    assert first["contract_id"] == one["id"] and first["contract_name"] == "Insurance"
    assert first["amount"] == _m("42.50")
    deadline = next(e for e in body["upcoming"] if e["type"] == "notice_deadline")
    assert deadline["amount"] is None
    assert [e["date"] for e in body["upcoming"]] == sorted(e["date"] for e in body["upcoming"])


async def test_upcoming_is_capped_at_ten(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "insurance")
    for _ in range(3):  # 5 weekly payments each in the window
        await _contract(aclient, h, space, cat, frequency="weekly")
    body = await _get(aclient, h, space)
    assert len(body["upcoming"]) == 10


async def test_invalid_month_is_422(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    for bad in ("2041-13", "2041-00", "2041-6", "June", "0000-01", "2041-06-01", ""):
        r = await aclient.get(f"{API}/{space}/dashboard", params={"month": bad}, headers=h)
        assert r.status_code == 422, bad
        assert r.headers["content-type"].startswith("application/problem+json")


async def test_stranger_gets_404(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, owner = await _user(aclient, key)
    _, stranger = await _user(aclient, key)
    space = await _household(aclient, owner)
    r = await aclient.get(f"{API}/{space}/dashboard", headers=stranger)
    assert r.status_code == 404
    assert (await aclient.get(f"{API}/{uuid4()}/dashboard", headers=owner)).status_code == 404
    assert (await aclient.get(f"{API}/{space}/dashboard")).status_code == 401


async def test_recurring_counts_only_contracts_that_pay_in_the_month(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "insurance")
    await _contract(aclient, h, space, cat, amount="1.00")  # open-ended: counted
    await _contract(aclient, h, space, cat, amount="2.00", end_date="2041-06-01")  # ends on day 1
    await _contract(
        aclient, h, space, cat, amount="4.00", start_date="2041-06-30"
    )  # starts last day
    await _contract(  # auto-renew keeps paying after its end date
        aclient, h, space, cat, amount="8.00", auto_renew=True, end_date="2041-03-01"
    )
    await _contract(aclient, h, space, cat, amount="100.00", end_date="2041-05-31")  # ended
    await _contract(aclient, h, space, cat, amount="200.00", start_date="2041-07-01")  # future
    body = await _get(aclient, h, space)
    assert body["recurring_monthly"] == _m("15.00")


async def test_other_spaces_stay_out_of_the_totals(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, h = await _user(aclient, key)
    first = await _household(aclient, h)
    second = await _household(aclient, h)
    for space, amount in ((first, "10.00"), (second, "7000.00")):
        cat = await _cat(aclient, h, space, "food")
        await _expense(aclient, h, space, cat, "2041-06-10", amount=amount)
        await _income(aclient, h, space, "2041-06-10", amount=amount)
        icat = await _cat(aclient, h, space, "insurance")
        await _contract(aclient, h, space, icat, amount=amount)
    body = await _get(aclient, h, space=first)
    assert body["spent_this_month"] == _m("10.00")
    assert body["income_this_month"] == _m("10.00")
    assert body["recurring_monthly"] == _m("10.00")


async def test_has_records_ignores_the_month(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    assert (await _get(aclient, h, space))["has_records"] is False
    cat = await _cat(aclient, h, space, "food")
    await _expense(aclient, h, space, cat, "2041-05-10")  # another month
    body = await _get(aclient, h, space)
    assert body["has_records"] is True
    assert body["spent_this_month"] == _m("0.00")
    # each kind alone is enough
    for kind in ("income", "contract"):
        other = await _household(aclient, h)
        assert (await _get(aclient, h, other))["has_records"] is False
        if kind == "income":
            await _income(aclient, h, other, "2041-05-10")
        else:
            icat = await _cat(aclient, h, other, "insurance")
            await _contract(aclient, h, other, icat, end_date="2041-05-31")
        assert (await _get(aclient, h, other))["has_records"] is True
