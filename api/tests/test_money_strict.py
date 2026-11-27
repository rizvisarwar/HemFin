from decimal import Decimal

import pytest
from pydantic import ValidationError

from hemfin.core.money import AmountIn
from hemfin.modules.contracts.schemas import ContractCreate

CAT = "6f1c2d0e-5a4b-4c8e-9a57-3b1e0f7d2c11"


@pytest.mark.parametrize(
    "amount",
    ["1e3", "1E3", "1_000", "+5", " 12.50 ", "12.50\n", "-1", "1.", ".5", "１２", "12,50"],
)
def test_amount_string_must_match_the_published_pattern(amount: str) -> None:
    with pytest.raises(ValidationError):
        AmountIn.model_validate({"amount": amount})
    with pytest.raises(ValidationError):
        ContractCreate.model_validate(
            {
                "category_id": CAT,
                "name": "x",
                "amount": amount,
                "frequency": "monthly",
                "start_date": "2026-01-01",
            }
        )


def test_amount_plain_strings_are_accepted() -> None:
    assert AmountIn.model_validate({"amount": "12.50"}).amount == Decimal("12.50")
    assert AmountIn.model_validate({"amount": "7"}).amount == Decimal(7)
