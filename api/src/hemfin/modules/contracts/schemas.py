from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import AfterValidator, BaseModel, Field, StringConstraints, model_validator

from hemfin.core.money import Currency, Money, MoneyBase, validate_amount
from hemfin.modules.contracts.models import ContractStatus
from hemfin.modules.contracts.schedule import EventType, Frequency

_MIN_DATE = date(1900, 1, 1)
_MAX_DATE = date(2200, 12, 31)


def _date_range(v: date) -> date:
    if not _MIN_DATE <= v <= _MAX_DATE:
        raise ValueError("Date must be between 1900 and 2200.")
    return v


Day = date  # alias: a field named `date` would shadow the type inside its class body
CalendarDate = Annotated[date, AfterValidator(_date_range)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Provider = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Notes = Annotated[str, StringConstraints(max_length=2000)]
TermMonths = Annotated[int, Field(ge=1, le=120)]
NoticeDays = Annotated[int, Field(ge=0, le=3650)]


class ContractCreate(Money):
    category_id: UUID
    name: Name
    provider: Provider | None = None
    frequency: Frequency
    start_date: CalendarDate
    end_date: CalendarDate | None = None
    auto_renew: bool = False
    renewal_term_months: TermMonths | None = None
    notice_period_days: NoticeDays | None = None
    member_user_id: UUID | None = None
    notes: Notes | None = None

    @model_validator(mode="after")
    def _dates(self) -> "ContractCreate":
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date.")
        return self


class ContractPatch(BaseModel):
    """Partial update. Omitted fields are unchanged; nullable fields can be set to null."""

    category_id: UUID | None = None
    name: Name | None = None
    provider: Provider | None = None
    amount: Decimal | None = None
    currency: Currency | None = None
    frequency: Frequency | None = None
    start_date: CalendarDate | None = None
    end_date: CalendarDate | None = None
    auto_renew: bool | None = None
    renewal_term_months: TermMonths | None = None
    notice_period_days: NoticeDays | None = None
    member_user_id: UUID | None = None
    status: ContractStatus | None = None
    notes: Notes | None = None

    @model_validator(mode="after")
    def _checks(self) -> "ContractPatch":
        required = (
            "category_id",
            "name",
            "amount",
            "currency",
            "frequency",
            "start_date",
            "auto_renew",
            "status",
        )
        for f in required:
            if f in self.model_fields_set and getattr(self, f) is None:
                raise ValueError(f"{f} cannot be null.")
        if self.amount is not None and self.currency is not None:
            validate_amount(self.amount, self.currency)
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValueError("end_date must be on or after start_date.")
        return self


class ScheduleOut(BaseModel):
    next_payment_date: date | None
    renewal_date: date | None
    notice_deadline: date | None


class ContractOut(MoneyBase):
    id: UUID
    space_id: UUID
    category_id: UUID
    category: str  # category key, for example insurance.home
    name: str
    provider: str | None
    frequency: Frequency
    start_date: date
    end_date: date | None
    auto_renew: bool
    renewal_term_months: int | None
    notice_period_days: int | None
    member_user_id: UUID | None
    status: ContractStatus
    notes: str | None
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    schedule: ScheduleOut


class UpcomingEvent(BaseModel):
    type: EventType
    date: Day
    contract_id: UUID
    contract_name: str
    amount: MoneyBase


class UpcomingOut(BaseModel):
    as_of: date
    until: date
    items: list[UpcomingEvent]
