"""FX parsing, fetching, conversion maths and the /fx job. No database, no network."""

from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from hemfin.core.config import Settings, get_settings
from hemfin.core.db import get_session
from hemfin.modules.fx import service

FIXTURES = Path(__file__).parent / "fixtures"
JOB = "/internal/jobs/fx"
SECRET = "s3cret-for-test"
D = date(2026, 11, 26)


def _fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


# --- parsing ---------------------------------------------------------------------------------


def test_parse_daily_fixture() -> None:
    rates = service.parse_rates(_fixture("ecb_daily.xml"))
    assert list(rates) == [D]
    assert rates[D]["USD"] == Decimal("1.1550")
    assert rates[D]["JPY"] == Decimal("180.25")
    assert len(rates[D]) == 4


def test_parse_hist_fixture_has_several_dates() -> None:
    rates = service.parse_rates(_fixture("ecb_hist.xml"))
    assert sorted(rates) == [date(2026, 11, 24), date(2026, 11, 25), D]
    assert rates[date(2026, 11, 25)]["USD"] == Decimal("1.1500")


_BILLION_LAUGHS = b"""<?xml version="1.0"?>
<!DOCTYPE lolz [
 <!ENTITY lol "lol">
 <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
 <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
]>
<Envelope>
<Cube><Cube time="2026-11-26"><Cube currency="USD" rate="1.1"/></Cube></Cube>
&lol3;
</Envelope>
"""
_XXE = b"""<?xml version="1.0"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<Envelope>
<Cube><Cube time="2026-11-26"><Cube currency="USD" rate="1.1"/></Cube>&xxe;</Cube>
</Envelope>
"""


@pytest.mark.parametrize("xml", [_BILLION_LAUGHS, _XXE], ids=["billion-laughs", "xxe"])
def test_malicious_xml_is_rejected(xml: bytes) -> None:
    with pytest.raises(service.FxFetchError):
        service.parse_rates(xml)


@pytest.mark.parametrize(
    "xml",
    [
        b"not xml at all",
        b"<Envelope/>",
        b'<E><Cube time="not-a-date"><Cube currency="USD" rate="1.1"/></Cube></E>',
        b'<E><Cube time="2026-11-26"><Cube currency="USD" rate="abc"/></Cube></E>',
        b'<E><Cube time="2026-11-26"><Cube currency="USD" rate="NaN"/></Cube></E>',
        b'<E><Cube time="2026-11-26"><Cube currency="USD" rate="0"/></Cube></E>',
        b'<E><Cube time="2026-11-26"><Cube currency="USD" rate="-1"/></Cube></E>',
        b'<E><Cube time="2026-11-26"><Cube currency="US1" rate="1.1"/></Cube></E>',
    ],
)
def test_invalid_feeds_are_rejected(xml: bytes) -> None:
    with pytest.raises(service.FxFetchError):
        service.parse_rates(xml)


# --- fetching (mocked transport, never the real ECB) ---------------------------------------------


async def test_fetch_returns_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"<x/>")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        assert await service.fetch_xml("http://ecb.test/x.xml", 5, client=c) == b"<x/>"


@pytest.mark.parametrize("status", [404, 500, 503])
async def test_fetch_http_error_is_a_fetch_error(status: int) -> None:
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(status))
    ) as c:
        with pytest.raises(service.FxFetchError):
            await service.fetch_xml("http://ecb.test/x.xml", 5, client=c)


async def test_fetch_timeout_is_a_fetch_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("slow", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        with pytest.raises(service.FxFetchError):
            await service.fetch_xml("http://ecb.test/x.xml", 5, client=c)


async def test_fetch_rejects_oversized_feed() -> None:
    big = b"x" * (service.MAX_FEED_BYTES + 1)
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, content=big))
    ) as c:
        with pytest.raises(service.FxFetchError):
            await service.fetch_xml("http://ecb.test/x.xml", 5, client=c)


# --- conversion maths ----------------------------------------------------------------------------


def _rates(monkeypatch: pytest.MonkeyPatch, table: dict[str, str]) -> None:
    async def fake(_: Any, quote: str, on_date: date) -> Decimal | None:
        if quote == "EUR":
            return Decimal(1)
        return Decimal(table[quote]) if quote in table else None

    monkeypatch.setattr(service, "_latest_rate", fake)


async def _conv(amount: str, a: str, b: str) -> Decimal | None:
    return await service.convert(None, Decimal(amount), a, b, D)  # type: ignore[arg-type]


async def test_same_currency_is_unchanged_and_needs_no_rate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _rates(monkeypatch, {})
    assert await _conv("12.3456", "SEK", "sek") == Decimal("12.3456")


async def test_eur_to_x_and_x_to_eur(monkeypatch: pytest.MonkeyPatch) -> None:
    _rates(monkeypatch, {"USD": "1.1550"})
    assert await _conv("100", "EUR", "USD") == Decimal("115.50")
    assert await _conv("115.50", "USD", "EUR") == Decimal("100.00")


async def test_cross_rate_goes_through_eur(monkeypatch: pytest.MonkeyPatch) -> None:
    _rates(monkeypatch, {"USD": "1.1550", "GBP": "0.87345"})
    # 100 / 1.1550 * 0.87345 = 75.6233766...
    assert await _conv("100", "USD", "GBP") == Decimal("75.62")


async def test_missing_rate_gives_none(monkeypatch: pytest.MonkeyPatch) -> None:
    _rates(monkeypatch, {"USD": "1.1550"})
    assert await _conv("100", "EUR", "XYZ") is None
    assert await _conv("100", "XYZ", "EUR") is None
    assert await _conv("100", "USD", "XYZ") is None


async def test_rounding_is_half_even_to_minor_units(monkeypatch: pytest.MonkeyPatch) -> None:
    _rates(monkeypatch, {"AAA": "1.5", "JPY": "180.25", "KWD": "0.3"})
    assert await _conv("0.35", "EUR", "AAA") == Decimal("0.52")  # 0.525 -> even
    assert await _conv("0.45", "EUR", "AAA") == Decimal("0.68")  # 0.675 -> even
    assert await _conv("10", "EUR", "JPY") == Decimal("1802")  # 1802.5, zero decimals
    assert await _conv("1", "EUR", "KWD") == Decimal("0.300")  # three decimals


async def test_rounds_only_once_at_the_end(monkeypatch: pytest.MonkeyPatch) -> None:
    # 0.35 AAA is 0.11666... EUR; rounding that leg to 0.12 first would give 0.36 BBB.
    _rates(monkeypatch, {"AAA": "3", "BBB": "3.1"})
    assert await _conv("0.35", "AAA", "BBB") == Decimal("0.36")
    assert await _conv("0.34", "AAA", "BBB") == Decimal("0.35")  # early rounding would give 0.34


# --- the /fx job ---------------------------------------------------------------------------------


class _FakeSession:
    async def commit(self) -> None:
        self.committed = True


def _client(app: FastAPI, **settings: Any) -> httpx.AsyncClient:
    cfg = Settings(**settings)
    app.dependency_overrides[get_settings] = lambda: cfg
    app.dependency_overrides[get_session] = lambda: _FakeSession()
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


@pytest.mark.parametrize("header", [None, "", "wrong"])
async def test_job_wrong_or_missing_secret_is_401(authed_app: FastAPI, header: str | None) -> None:
    headers = {} if header is None else {"X-Job-Secret": header}
    async with _client(authed_app, JOB_SECRET=SECRET) as c:
        assert (await c.post(JOB, headers=headers)).status_code == 401


async def test_job_without_configured_secret_is_503(authed_app: FastAPI) -> None:
    async with _client(authed_app) as c:
        r = await c.post(JOB, headers={"X-Job-Secret": SECRET})
    assert r.status_code == 503


async def test_job_returns_date_and_count(
    authed_app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    stored: list[dict[date, dict[str, Decimal]]] = []
    urls: list[str] = []

    async def fake_has_rates(_: Any) -> bool:
        return True

    async def fake_fetch(url: str, timeout_seconds: float, client: Any = None) -> bytes:
        urls.append(url)
        return _fixture("ecb_daily.xml")

    async def fake_upsert(_: Any, rates: dict[date, dict[str, Decimal]]) -> int:
        stored.append(rates)
        return 4

    monkeypatch.setattr(service, "has_rates", fake_has_rates)
    monkeypatch.setattr(service, "fetch_xml", fake_fetch)
    monkeypatch.setattr(service, "upsert_rates", fake_upsert)
    async with _client(authed_app, JOB_SECRET=SECRET) as c:
        r = await c.post(JOB, headers={"X-Job-Secret": SECRET})
    assert r.status_code == 200
    assert r.json() == {"rate_date": "2026-11-26", "count": 4}
    assert urls == [Settings().FX_ECB_DAILY_URL]
    assert len(stored) == 1


async def test_job_backfills_from_90_day_feed_when_table_is_empty(
    authed_app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    urls: list[str] = []

    async def fake_has_rates(_: Any) -> bool:
        return False

    async def fake_fetch(url: str, timeout_seconds: float, client: Any = None) -> bytes:
        urls.append(url)
        return _fixture("ecb_hist.xml")

    async def fake_upsert(_: Any, rates: dict[date, dict[str, Decimal]]) -> int:
        assert len(rates) == 3
        return 6

    monkeypatch.setattr(service, "has_rates", fake_has_rates)
    monkeypatch.setattr(service, "fetch_xml", fake_fetch)
    monkeypatch.setattr(service, "upsert_rates", fake_upsert)
    async with _client(authed_app, JOB_SECRET=SECRET) as c:
        r = await c.post(JOB, headers={"X-Job-Secret": SECRET})
    assert r.status_code == 200
    assert r.json() == {"rate_date": "2026-11-26", "count": 2}
    assert urls == [Settings().FX_ECB_HIST_URL]


@pytest.mark.parametrize("failure", ["fetch", "parse"])
async def test_job_feed_failure_is_502_problem(
    authed_app: FastAPI, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    async def fake_has_rates(_: Any) -> bool:
        return True

    async def fake_fetch(url: str, timeout_seconds: float, client: Any = None) -> bytes:
        if failure == "fetch":
            raise service.FxFetchError("Could not fetch the exchange rate feed.")
        return b"<!DOCTYPE x [<!ENTITY a 'b'>]><x/>"

    monkeypatch.setattr(service, "has_rates", fake_has_rates)
    monkeypatch.setattr(service, "fetch_xml", fake_fetch)
    async with _client(authed_app, JOB_SECRET=SECRET) as c:
        r = await c.post(JOB, headers={"X-Job-Secret": SECRET})
    assert r.status_code == 502
    assert r.headers["content-type"].startswith("application/problem+json")
    assert r.json()["code"] == "fx_feed_unavailable"


async def test_fx_endpoint_requires_sign_in(aclient: httpx.AsyncClient) -> None:
    assert (await aclient.get("/api/v1/fx/rates")).status_code == 401
