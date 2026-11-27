from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, StringConstraints, model_validator

from hemfin.core.money import Amount, AmountIn, MoneyBase, validate_amount
from hemfin.modules.contracts.schemas import CalendarDate

Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
Merchant = Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)]


class ExpenseCreate(AmountIn):
    category_id: UUID
    spent_on: CalendarDate
    description: Description | None = None
    merchant: Merchant | None = None
    contract_id: UUID | None = None
    member_user_id: UUID | None = None


class ExpensePatch(BaseModel):
    """Partial update. Omitted fields are unchanged; nullable fields can be set to null."""

    category_id: UUID | None = None
    amount: Amount | None = None
    spent_on: CalendarDate | None = None
    description: Description | None = None
    merchant: Merchant | None = None
    contract_id: UUID | None = None
    member_user_id: UUID | None = None

    @model_validator(mode="after")
    def _checks(self) -> "ExpensePatch":
        for f in ("category_id", "amount", "spent_on"):
            if f in self.model_fields_set and getattr(self, f) is None:
                raise ValueError(f"{f} cannot be null.")
        if self.amount is not None:
            validate_amount(self.amount)
        return self


class ExpenseOut(MoneyBase):
    id: UUID
    space_id: UUID
    category_id: UUID
    category: str  # category key, for example food.groceries
    spent_on: date
    description: str | None
    merchant: str | None
    contract_id: UUID | None
    member_user_id: UUID | None
    created_by: UUID
    created_at: datetime
    updated_at: datetime
