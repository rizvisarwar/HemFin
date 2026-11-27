"""ECB euro reference rates: fetch, store, look up and convert.

Rates are quoted against EUR (1 EUR = rate units of the quote currency), so every conversion
goes through EUR as the cross currency. Money is Decimal throughout.
"""

import logging
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_EVEN, Decimal, InvalidOperation

import httpx
from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.modules.fx.models import FxRate

log = logging.getLogger("hemfin.fx")

BASE = "EUR"
MAX_LOOKBACK_DAYS = 7
MAX_FEED_BYTES = 5_000_000  # the 90-day feed is about 250 KB

# ISO 4217 minor units that differ from the default of 2.
_ZERO_DECIMAL = {
    "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "UYI", "VND",
    "VUV", "XAF", "XOF", "XPF",
}  # fmt: skip
_THREE_DECIMAL = {"BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"}


class FxFetchError(Exception):
    """The ECB feed could not be fetched or understood. Messages never include feed content."""


def minor_units(currency: str) -> int:
    if currency in _ZERO_DECIMAL:
        return 0
    if currency in _THREE_DECIMAL:
        return 3
    return 2


def parse_rates(xml: bytes) -> dict[date, dict[str, Decimal]]:
    """Parse an ECB eurofxref document into {date: {currency: rate}}.

    DTDs and entities are rejected (defusedxml), so billion-laughs and XXE input fails.
    """
    try:
        root = ElementTree.fromstring(xml, forbid_dtd=True)
    except (ElementTree.ParseError, DefusedXmlException):
        raise FxFetchError("The exchange rate feed is not valid XML.") from None
    out: dict[date, dict[str, Decimal]] = {}
    for day in root.iter():
        if not day.tag.endswith("Cube") or "time" not in day.attrib:
            continue
        try:
            rate_date = date.fromisoformat(day.attrib["time"])
        except ValueError:
            raise FxFetchError("The exchange rate feed has an invalid date.") from None
        rates = out.setdefault(rate_date, {})
        for node in day:
            code = node.attrib.get("currency", "")
            try:
                rate = Decimal(node.attrib.get("rate", ""))
            except InvalidOperation:
                raise FxFetchError("The exchange rate feed has an invalid rate.") from None
            if len(code) != 3 or not code.isascii() or not code.isalpha() or not rate.is_finite():
                raise FxFetchError("The exchange rate feed has an invalid entry.")
            if rate <= 0 or rate >= Decimal("1e10"):
                raise FxFetchError("The exchange rate feed has an out-of-range rate.")
            rates[code.upper()] = rate
    out = {d: r for d, r in out.items() if r}
    if not out:
        raise FxFetchError("The exchange rate feed contains no rates.")
    return out


async def fetch_xml(
    url: str, timeout_seconds: float, client: httpx.AsyncClient | None = None
) -> bytes:
    """GET the feed with a short timeout. Any failure becomes FxFetchError."""
    try:
        if client is not None:
            resp = await client.get(url, timeout=timeout_seconds)
        else:
            async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=False) as c:
                resp = await c.get(url)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        log.warning("fx feed fetch failed: %s", type(exc).__name__)
        raise FxFetchError("Could not fetch the exchange rate feed.") from None
    if len(resp.content) > MAX_FEED_BYTES:
        raise FxFetchError("The exchange rate feed is too large.")
    return resp.content


async def has_rates(session: AsyncSession) -> bool:
    return (await session.scalar(select(func.count()).select_from(FxRate))) != 0


async def upsert_rates(session: AsyncSession, rates: dict[date, dict[str, Decimal]]) -> int:
    """Insert rates that are not stored yet. Existing (date, quote) rows are left alone, so a
    repeat run is a no-op. Returns the number of rows in the input."""
    rows = [
        {"rate_date": d, "quote": q, "rate": r, "base": BASE}
        for d, by_quote in rates.items()
        for q, r in by_quote.items()
    ]
    for i in range(0, len(rows), 1000):
        stmt = pg_insert(FxRate).values(rows[i : i + 1000]).on_conflict_do_nothing()
        await session.execute(stmt)
    return len(rows)


async def refresh(
    session: AsyncSession, daily_url: str, hist_url: str, timeout_seconds: float
) -> tuple[date, int]:
    """Fetch and store ECB rates; backfills from the 90-day feed when the table is empty.

    Returns the latest rate date in the feed and how many rates it has. Does not commit.
    """
    url = daily_url if await has_rates(session) else hist_url
    rates = parse_rates(await fetch_xml(url, timeout_seconds))
    await upsert_rates(session, rates)
    latest = max(rates)
    return latest, len(rates[latest])


async def rates_on_or_before(
    session: AsyncSession, on_date: date
) -> tuple[date, dict[str, Decimal]] | None:
    """Rates for `on_date`, or for the latest earlier date that has any."""
    rate_date = await session.scalar(
        select(func.max(FxRate.rate_date)).where(FxRate.rate_date <= on_date)
    )
    if rate_date is None:
        return None
    rows = await session.execute(
        select(FxRate.quote, FxRate.rate).where(FxRate.rate_date == rate_date)
    )
    return rate_date, {q.strip(): r for q, r in rows.all()}


async def _latest_rate(session: AsyncSession, quote: str, on_date: date) -> Decimal | None:
    """Units of `quote` per 1 EUR: the latest rate on or before `on_date`, at most 7 days back."""
    if quote == BASE:
        return Decimal(1)
    return await session.scalar(
        select(FxRate.rate)
        .where(
            FxRate.quote == quote,
            FxRate.rate_date <= on_date,
            FxRate.rate_date >= on_date - timedelta(days=MAX_LOOKBACK_DAYS),
        )
        .order_by(FxRate.rate_date.desc())
        .limit(1)
    )


async def convert(
    session: AsyncSession, amount: Decimal, from_ccy: str, to_ccy: str, on_date: date
) -> Decimal | None:
    """Convert via EUR. None when a needed rate is missing; never guesses.

    Rounds once, at the end, to the target currency's minor units (ROUND_HALF_EVEN).
    Same currency returns the amount unchanged (not rounded).
    """
    from_ccy, to_ccy = from_ccy.upper(), to_ccy.upper()
    if from_ccy == to_ccy:
        return amount
    rate_from = await _latest_rate(session, from_ccy, on_date)
    rate_to = await _latest_rate(session, to_ccy, on_date)
    if rate_from is None or rate_to is None:
        return None
    result = amount / rate_from * rate_to
    return result.quantize(Decimal(1).scaleb(-minor_units(to_ccy)), rounding=ROUND_HALF_EVEN)


def today_utc() -> date:
    return datetime.now(UTC).date()
