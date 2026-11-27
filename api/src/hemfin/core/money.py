"""Shared money types. Money is `Decimal` plus an ISO-4217 currency, never a float.

The POC is Sweden only: every new record is stored in SEK (HEM-024). Responses still carry
`currency`, so multi-currency can return later without a data migration. Rows written before
that may hold another code; they simply display their own.

JSON carries amounts as strings (for example "12.50"). `AmountIn` validates input;
`MoneyBase` is the output shape (no re-validation, amounts rendered with 2 decimals).
"""

import re
from decimal import Decimal
from typing import Annotated

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    WithJsonSchema,
    field_serializer,
    model_validator,
)

CURRENCY = "SEK"
MINOR_UNITS = 2
# Columns are Numeric(18, 4): at most 14 integer digits.
MAX_AMOUNT = Decimal("99999999999999")

_AMOUNT_RE = re.compile(r"[0-9]+(\.[0-9]+)?")


def _string_or_decimal(v: object) -> object:
    """Amounts travel as strings. JSON numbers (float or int) are rejected, never rounded."""
    if isinstance(v, Decimal):
        return v
    if isinstance(v, str):
        # Exactly the published pattern: no sign, exponent, underscores or spaces.
        if _AMOUNT_RE.fullmatch(v) is None:
            raise ValueError('Amount must be a plain decimal string, for example "12.50".')
        return v
    raise ValueError('Amount must be a string, for example "12.50".')


# String-only in the OpenAPI input schema too, so generated clients type it as `string`.
Amount = Annotated[
    Decimal,
    BeforeValidator(_string_or_decimal),
    WithJsonSchema({"type": "string", "pattern": r"^\d+(\.\d+)?$", "examples": ["12.50"]}),
]


def validate_amount(amount: Decimal) -> Decimal:
    """A positive, finite SEK amount with at most 2 decimals."""
    if not amount.is_finite():
        raise ValueError("Amount must be a finite number.")
    if amount <= 0:
        raise ValueError("Amount must be greater than 0.")
    if amount > MAX_AMOUNT:
        raise ValueError("Amount is too large.")
    # Strip trailing zeros from the digit tuple. `normalize()` would round to the context
    # precision and could hide excess decimals (100.000...0001).
    _, digits, exponent = amount.as_tuple()
    assert isinstance(exponent, int)
    trailing = len(digits) - len("".join(map(str, digits)).rstrip("0"))
    if exponent + trailing < -MINOR_UNITS:
        raise ValueError(f"Amounts allow at most {MINOR_UNITS} decimal places.")
    return amount


class MoneyBase(BaseModel):
    """Output shape: amount as a string with 2 decimals, and the stored currency code."""

    model_config = ConfigDict(from_attributes=True)

    amount: Amount
    currency: str = CURRENCY

    @field_serializer("amount")
    def _amount_str(self, v: Decimal) -> str:
        return format(v.quantize(Decimal(1).scaleb(-MINOR_UNITS)), "f")


class AmountIn(BaseModel):
    """Validated amount input. The currency is not an input; the server always writes SEK.

    Unknown fields (including a stray `currency`) are ignored, as everywhere else in the API.
    """

    amount: Amount

    @model_validator(mode="after")
    def _check_amount(self) -> "AmountIn":
        validate_amount(self.amount)
        return self
