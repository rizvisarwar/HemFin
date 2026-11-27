from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, StringConstraints, model_validator

from hemfin.core.money import Amount, Currency, Money, MoneyBase, validate_amount
from hemfin.modules.contracts.schemas import CalendarDate, Name
from hemfin.modules.income.models import IncomeFrequency, IncomeType

Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


class SourceCreate(Money):
    name: Name
    type: IncomeType
    frequency: IncomeFrequency
    member_user_id: UUID | None = None
    active: bool = True


class SourcePatch(BaseModel):
    """Partial update. Omitted fields are unchanged; `member_user_id` can be set to null."""

    name: Name | None = None
    type: IncomeType | None = None
    amount: Amount | None = None
    currency: Currency | None = None
    frequency: IncomeFrequency | None = None
    member_user_id: UUID | None = None
    active: bool | None = None

    @model_validator(mode="after")
    def _checks(self) -> "SourcePatch":
        for f in ("name", "type", "amount", "currency", "frequency", "active"):
            if f in self.model_fields_set and getattr(self, f) is None:
                raise ValueError(f"{f} cannot be null.")
        if self.amount is not None and self.currency is not None:
            validate_amount(self.amount, self.currency)
        return self


class SourceOut(MoneyBase):
    id: UUID
    space_id: UUID
    name: str
    type: IncomeType
    frequency: IncomeFrequency
    member_user_id: UUID | None
    active: bool
    created_by: UUID
    created_at: datetime
    updated_at: datetime


class EntryCreate(Money):
    source_id: UUID | None = None
    received_on: CalendarDate
    description: Description | None = None
    member_user_id: UUID | None = None


class EntryPatch(BaseModel):
    """Partial update. Omitted fields are unchanged; nullable fields can be set to null."""

    source_id: UUID | None = None
    amount: Amount | None = None
    currency: Currency | None = None
    received_on: CalendarDate | None = None
    description: Description | None = None
    member_user_id: UUID | None = None

    @model_validator(mode="after")
    def _checks(self) -> "EntryPatch":
        for f in ("amount", "currency", "received_on"):
            if f in self.model_fields_set and getattr(self, f) is None:
                raise ValueError(f"{f} cannot be null.")
        if self.amount is not None and self.currency is not None:
            validate_amount(self.amount, self.currency)
        return self


class EntryOut(MoneyBase):
    id: UUID
    space_id: UUID
    source_id: UUID | None
    received_on: date
    description: str | None
    member_user_id: UUID | None
    # In the caller's base currency at `received_on`; null when no rate exists.
    base_amount: MoneyBase | None
    created_by: UUID
    created_at: datetime
    updated_at: datetime
