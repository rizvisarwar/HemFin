"""Shared money types. Money is `Decimal` plus an ISO-4217 currency, never a float.

JSON carries amounts as strings (for example "12.50"). `Money` validates input; `MoneyBase`
is the output shape (no re-validation, amounts rendered to the currency's minor units).
HEM-019 reuses these for expenses and income.
"""

import re
from decimal import Decimal
from typing import Annotated

import pycountry
from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    StringConstraints,
    WithJsonSchema,
    field_serializer,
    model_validator,
)

# ISO 4217 minor units that differ from the default of 2.
_MINOR_UNITS = {
    **dict.fromkeys(
        [
            "BIF",
            "CLP",
            "DJF",
            "GNF",
            "ISK",
            "JPY",
            "KMF",
            "KRW",
            "PYG",
            "RWF",
            "UGX",
            "UYI",
            "VND",
            "VUV",
            "XAF",
            "XOF",
            "XPF",
        ],
        0,
    ),
    **dict.fromkeys(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"], 3),
    **dict.fromkeys(["CLF", "UYW"], 4),
}
DEFAULT_MINOR_UNITS = 2
# Columns are Numeric(18, 4): at most 14 integer digits.
MAX_AMOUNT = Decimal("99999999999999")


def _currency(v: str) -> str:
    code = v.strip().upper()
    if pycountry.currencies.get(alpha_3=code) is None:
        raise ValueError("Must be an ISO 4217 currency code, for example EUR.")
    return code


Currency = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_upper=True, min_length=3, max_length=3),
    AfterValidator(_currency),
]


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


def minor_units(currency: str) -> int:
    """Decimal places of the currency's minor unit (JPY 0, EUR 2, KWD 3)."""
    return _MINOR_UNITS.get(currency.upper(), DEFAULT_MINOR_UNITS)


def validate_amount(amount: Decimal, currency: str) -> Decimal:
    """A positive, finite amount with at most the currency's minor-unit decimals."""
    if not amount.is_finite():
        raise ValueError("Amount must be a finite number.")
    if amount <= 0:
        raise ValueError("Amount must be greater than 0.")
    if amount > MAX_AMOUNT:
        raise ValueError("Amount is too large.")
    places = minor_units(currency)
    # Strip trailing zeros from the digit tuple. `normalize()` would round to the context
    # precision and could hide excess decimals (100.000...0001 JPY).
    _, digits, exponent = amount.as_tuple()
    assert isinstance(exponent, int)
    trailing = len(digits) - len("".join(map(str, digits)).rstrip("0"))
    if exponent + trailing < -places:
        raise ValueError(f"{currency.upper()} allows at most {places} decimal places.")
    return amount


class MoneyBase(BaseModel):
    """Output shape: amount as a string at the currency's minor units."""

    model_config = ConfigDict(from_attributes=True)

    amount: Amount
    currency: Currency

    @field_serializer("amount")
    def _amount_str(self, v: Decimal) -> str:
        places = minor_units(self.currency)
        return format(v.quantize(Decimal(1).scaleb(-places)), "f")


class Money(MoneyBase):
    """Validated money input."""

    @model_validator(mode="after")
    def _check_amount(self) -> "Money":
        validate_amount(self.amount, self.currency)
        return self
