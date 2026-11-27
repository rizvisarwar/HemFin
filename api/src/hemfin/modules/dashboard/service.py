"""Dashboard summary: month totals in SEK, plus the next 30 days.

Totals are plain Decimal sums. Records whose stored currency is not SEK (demo rows from before
HEM-024) are excluded from the totals; there is no UI for it.

Recurring cost counts contracts that pay in the month: active, started by the month's last day,
and not ended before its first day unless they auto-renew. Each contract contributes its
unrounded monthly equivalent; the total is rounded once to 2 decimals.
"""

import calendar
from datetime import date
from decimal import ROUND_HALF_EVEN, Decimal
from uuid import UUID

from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.money import CURRENCY, MINOR_UNITS, MoneyBase
from hemfin.modules.contracts import service as contracts
from hemfin.modules.contracts.models import Contract, ContractStatus
from hemfin.modules.contracts.schedule import EventType, Frequency
from hemfin.modules.dashboard.schemas import DashboardEvent, DashboardOut
from hemfin.modules.expenses.models import Expense
from hemfin.modules.income.models import IncomeEntry

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


def _total(amounts: list[Decimal]) -> MoneyBase:
    total = sum(amounts, Decimal(0)).quantize(Decimal(1).scaleb(-MINOR_UNITS), ROUND_HALF_EVEN)
    return MoneyBase(amount=total, currency=CURRENCY)


async def dashboard(
    session: AsyncSession, *, space_id: UUID, user_id: UUID, month: str, today: date
) -> DashboardOut:
    first, last = month_bounds(month)

    expenses = (
        await session.execute(
            select(Expense.amount).where(
                Expense.space_id == space_id,
                Expense.currency == CURRENCY,
                Expense.spent_on >= first,
                Expense.spent_on <= last,
            )
        )
    ).all()
    entries = (
        await session.execute(
            select(IncomeEntry.amount).where(
                IncomeEntry.space_id == space_id,
                IncomeEntry.currency == CURRENCY,
                IncomeEntry.received_on >= first,
                IncomeEntry.received_on <= last,
            )
        )
    ).all()
    contract_rows = (
        await session.execute(
            select(Contract.amount, Contract.frequency).where(
                Contract.space_id == space_id,
                Contract.currency == CURRENCY,
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

    spent = _total([a for (a,) in expenses])
    income = _total([a for (a,) in entries])
    recurring = _total([monthly_amount(a, Frequency(f)) for a, f in contract_rows])

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
        spent_this_month=spent,
        recurring_monthly=recurring,
        income_this_month=income,
        upcoming=events,
        has_records=has_records,
    )
