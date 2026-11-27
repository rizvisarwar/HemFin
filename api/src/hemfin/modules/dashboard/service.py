"""Dashboard summary: month totals in the caller's base currency, plus the next 30 days.

Conversion dates (a rate is looked up per item at its own date):
- expenses: `spent_on`; income entries: `received_on`.
- recurring contracts: the first day of the requested month, or today when that day is still
  in the future (rates do not exist for future dates). A monthly total has no date of its
  own, so one date per month keeps the figure stable through the month.

Recurring cost counts contracts that pay in the month: active, started by the month's last day,
and not ended before its first day unless they auto-renew.

Each total sums unrounded converted values and rounds once to the base currency's minor
units. An item with no rate is skipped and counted in `unconverted_count`, never guessed.
"""

import calendar
from datetime import date
from decimal import ROUND_HALF_EVEN, Decimal
from uuid import UUID

from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.money import MoneyBase, minor_units
from hemfin.modules.contracts import service as contracts
from hemfin.modules.contracts.models import Contract, ContractStatus
from hemfin.modules.contracts.schedule import EventType, Frequency
from hemfin.modules.dashboard.schemas import DashboardEvent, DashboardOut
from hemfin.modules.expenses.models import Expense
from hemfin.modules.fx.service import convert_many
from hemfin.modules.income.models import IncomeEntry
from hemfin.modules.profile.service import get_profile

UPCOMING_DAYS = 30
UPCOMING_LIMIT = 10

_DIVISOR = {Frequency.quarterly: 3, Frequency.semiannual: 6, Frequency.annual: 12}


def monthly_amount(amount: Decimal, frequency: Frequency) -> Decimal:
    """Unrounded monthly equivalent: weekly x 52/12, monthly x 1, quarterly /3, and so on."""
    if frequency is Frequency.weekly:
        return amount * 52 / 12
    if frequency is Frequency.monthly:
        return amount
    return amount / _DIVISOR[frequency]


def current_month(today: date) -> str:
    return f"{today.year:04d}-{today.month:02d}"


def month_bounds(month: str) -> tuple[date, date]:
    """First and last day of `YYYY-MM` (the router has validated the format)."""
    year, mon = int(month[:4]), int(month[5:])
    return date(year, mon, 1), date(year, mon, calendar.monthrange(year, mon)[1])


async def _total(
    session: AsyncSession, base: str, items: list[tuple[Decimal, str, date]]
) -> tuple[MoneyBase, int]:
    converted = await convert_many(session, base, items, round_results=False)
    total = sum((c for c in converted if c is not None), Decimal(0))
    total = total.quantize(Decimal(1).scaleb(-minor_units(base)), rounding=ROUND_HALF_EVEN)
    skipped = sum(1 for c in converted if c is None)
    return MoneyBase(amount=total, currency=base), skipped


async def dashboard(
    session: AsyncSession, *, space_id: UUID, user_id: UUID, month: str, today: date
) -> DashboardOut:
    base = (await get_profile(session, user_id)).base_currency
    first, last = month_bounds(month)

    expenses = (
        await session.execute(
            select(Expense.amount, Expense.currency, Expense.spent_on).where(
                Expense.space_id == space_id, Expense.spent_on >= first, Expense.spent_on <= last
            )
        )
    ).all()
    entries = (
        await session.execute(
            select(IncomeEntry.amount, IncomeEntry.currency, IncomeEntry.received_on).where(
                IncomeEntry.space_id == space_id,
                IncomeEntry.received_on >= first,
                IncomeEntry.received_on <= last,
            )
        )
    ).all()
    contract_rows = (
        await session.execute(
            select(Contract.amount, Contract.currency, Contract.frequency).where(
                Contract.space_id == space_id,
                Contract.status == ContractStatus.active.value,
                # Pays in the month: started by its last day, and not ended before its first day
                # (an auto-renew contract keeps paying after `end_date`, the end of its term).
                Contract.start_date <= last,
                or_(
                    Contract.auto_renew.is_(True),
                    Contract.end_date.is_(None),
                    Contract.end_date >= first,
                ),
            )
        )
    ).all()

    has_records = any(
        [
            await session.scalar(select(exists().where(m.space_id == space_id)))
            for m in (Contract, Expense, IncomeEntry)
        ]
    )

    rate_day = min(first, today)
    spent, miss_spent = await _total(session, base, [(a, c, d) for a, c, d in expenses])
    income, miss_income = await _total(session, base, [(a, c, d) for a, c, d in entries])
    recurring, miss_rec = await _total(
        session,
        base,
        [(monthly_amount(a, Frequency(f)), c, rate_day) for a, c, f in contract_rows],
    )

    page = await contracts.upcoming(
        session, space_id=space_id, as_of=today, days=UPCOMING_DAYS, limit=UPCOMING_LIMIT
    )
    events = [
        DashboardEvent(
            type=e.type,
            date=e.date,
            contract_id=e.contract_id,
            contract_name=e.contract_name,
            amount=None if e.type is EventType.notice_deadline else e.amount,
        )
        for e in page.items
    ]
    return DashboardOut(
        month=month,
        base_currency=base,
        spent_this_month=spent,
        recurring_monthly=recurring,
        income_this_month=income,
        upcoming=events,
        has_records=has_records,
        unconverted_count=miss_spent + miss_income + miss_rec,
    )
