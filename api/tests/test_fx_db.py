"""DB-backed FX tests (CI only). Dates sit in 1999 so they never clash with real ECB data."""

from collections.abc import AsyncIterator
from datetime import date
from decimal import Decimal
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import func, select

from authkit import TestKey
from hemfin.core import db
from hemfin.modules.fx import service
from hemfin.modules.fx.models import FxRate

pytestmark = pytest.mark.db


@pytest.fixture(autouse=True)
async def _fresh_engine() -> AsyncIterator[None]:
    """Each test runs on its own event loop, so the pooled engine must not outlive it."""
    yield
    await db.dispose_engine()


D1 = date(1999, 1, 4)
D2 = date(1999, 1, 5)


def _h(key: TestKey) -> dict[str, str]:
    sub = uuid4()
    return {"Authorization": f"Bearer {key.token(sub, f'{sub}@example.test')}"}


async def _seed() -> None:
    async with db.get_session_ctx() as s:
        await service.upsert_rates(
            s,
            {
                D1: {"USD": Decimal("1.1789"), "JPY": Decimal("133.73")},
                D2: {"USD": Decimal("1.1790"), "JPY": Decimal("130.96")},
            },
        )
        await s.commit()


async def test_upsert_is_idempotent_and_does_not_overwrite() -> None:
    day = date(1999, 2, 1)
    async with db.get_session_ctx() as s:
        rates = {day: {"USD": Decimal("1.5"), "CHF": Decimal("1.6")}}
        await service.upsert_rates(s, rates)
        await service.upsert_rates(s, rates)
        await service.upsert_rates(s, {day: {"USD": Decimal("9.9")}})
        await s.commit()
    async with db.get_session_ctx() as s:
        count = await s.scalar(
            select(func.count()).select_from(FxRate).where(FxRate.rate_date == day)
        )
        usd = await s.scalar(
            select(FxRate.rate).where(FxRate.rate_date == day, FxRate.quote == "USD")
        )
    assert count == 2
    assert usd == Decimal("1.50000000")


async def test_convert_uses_latest_rate_within_seven_days() -> None:
    await _seed()
    async with db.get_session_ctx() as s:
        # Exact date, then a Sunday-style gap, then exactly 7 days back (allowed), then 8 (not).
        assert await service.convert(s, Decimal("100"), "EUR", "USD", D2) == Decimal("117.90")
        assert await service.convert(s, Decimal("100"), "EUR", "USD", date(1999, 1, 8)) == Decimal(
            "117.90"
        )
        assert await service.convert(s, Decimal("100"), "EUR", "USD", date(1999, 1, 12)) == Decimal(
            "117.90"
        )
        assert await service.convert(s, Decimal("100"), "EUR", "USD", date(1999, 1, 13)) is None
        # Before any stored rate.
        assert await service.convert(s, Decimal("100"), "EUR", "USD", date(1999, 1, 3)) is None
        # Cross currency and unknown quote.
        assert await service.convert(s, Decimal("1000"), "USD", "JPY", D1) == Decimal("113436")
        assert await service.convert(s, Decimal("1"), "EUR", "XYZ", D1) is None
        assert await service.convert(s, Decimal("5"), "EUR", "EUR", D1) == Decimal("5")


async def test_rates_endpoint_returns_that_date_or_latest_before(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    await _seed()
    r = await aclient.get("/api/v1/fx/rates", params={"date": "1999-01-05"}, headers=_h(key))
    assert r.status_code == 200
    body = r.json()
    assert body["rate_date"] == "1999-01-05" and body["base"] == "EUR"
    assert body["rates"]["USD"] == "1.17900000"

    r = await aclient.get("/api/v1/fx/rates", params={"date": "1999-01-06"}, headers=_h(key))
    assert r.json()["rate_date"] == "1999-01-05"

    r = await aclient.get("/api/v1/fx/rates", params={"date": "1999-01-04"}, headers=_h(key))
    assert r.json()["rate_date"] == "1999-01-04"
    assert r.json()["rates"]["JPY"] == "133.73000000"


async def test_rates_endpoint_404_before_any_data_and_422_on_bad_date(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    r = await aclient.get("/api/v1/fx/rates", params={"date": "1980-01-01"}, headers=_h(key))
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/problem+json")
    r = await aclient.get("/api/v1/fx/rates", params={"date": "nope"}, headers=_h(key))
    assert r.status_code == 422
