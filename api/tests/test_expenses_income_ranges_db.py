"""Range and strict-amount checks for expenses and income entries (DB-backed)."""

import httpx
import pytest

from authkit import TestKey
from test_expenses_income_db import (  # noqa: F401  (the autouse fixture pins today)
    API,
    _cat,
    _entry,
    _exp,
    _household,
    _mk_expense,
    _pin_today,
    _user,
)

pytestmark = pytest.mark.db


async def test_from_after_to_is_422_and_single_day_range_works(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "food")
    e1 = await _mk_expense(aclient, h, space, cat, spent_on="2040-06-02")
    await _mk_expense(aclient, h, space, cat, spent_on="2040-06-03")
    url = f"{API}/{space}/income-entries"
    n1 = (await aclient.post(url, json=_entry(received_on="2040-06-02"), headers=h)).json()
    await aclient.post(url, json=_entry(received_on="2040-06-03"), headers=h)
    for kind, expected in (("expenses", e1["id"]), ("income-entries", n1["id"])):
        url = f"{API}/{space}/{kind}"
        r = await aclient.get(url, params={"from": "2040-06-03", "to": "2040-06-02"}, headers=h)
        assert r.status_code == 422 and r.json()["code"] == "invalid_dates", kind
        r = await aclient.get(url, params={"from": "2040-06-02", "to": "2040-06-02"}, headers=h)
        assert r.status_code == 200, kind
        assert [i["id"] for i in r.json()["items"]] == [expected], kind


async def test_amount_strings_are_strict(aclient: httpx.AsyncClient, key: TestKey) -> None:
    _, h = await _user(aclient, key)
    space = await _household(aclient, h)
    cat = await _cat(aclient, h, space, "food")
    for amount in ("1e3", "1_000", "+5", " 12.50 "):
        r = await aclient.post(f"{API}/{space}/expenses", json=_exp(cat, amount=amount), headers=h)
        assert r.status_code == 422, amount
        r = await aclient.post(
            f"{API}/{space}/income-entries", json=_entry(amount=amount), headers=h
        )
        assert r.status_code == 422, amount
