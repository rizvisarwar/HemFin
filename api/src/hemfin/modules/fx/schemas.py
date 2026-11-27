from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class FxRatesOut(BaseModel):
    """Euro foreign exchange reference rates: 1 EUR = rates[code] units of that currency."""

    rate_date: date
    base: str = "EUR"
    rates: dict[str, Decimal]
