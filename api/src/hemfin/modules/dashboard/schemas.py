from datetime import date
from uuid import UUID

from pydantic import BaseModel

from hemfin.core.money import MoneyBase
from hemfin.modules.contracts.schedule import EventType


class DashboardEvent(BaseModel):
    type: EventType
    date: date
    contract_id: UUID
    contract_name: str
    # In the contract's stored currency (SEK). Null for a notice deadline (it is not a payment).
    amount: MoneyBase | None


class DashboardOut(BaseModel):
    month: str  # YYYY-MM
    spent_this_month: MoneyBase
    recurring_monthly: MoneyBase
    income_this_month: MoneyBase
    upcoming: list[DashboardEvent]
    # Any contract, expense or income entry in the space at all (any month): false is the first run.
    has_records: bool
