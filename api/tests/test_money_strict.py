import json
from decimal import Decimal

import pytest
from pydantic import ValidationError

from hemfin.core.money import Money, MoneyBase, minor_units, validate_amount
from hemfin.modules.contracts.schemas import ContractCreate

CAT = "6f1c2d0e-5a4b-4c8e-9a57-3b1e0f7d2c11"


@pytest.mark.parametrize(
    "amount",
    ["1e3", "1E3", "1_000", "+5", " 12.50 ", "12.50\n", "-1", "1.", ".5", "１２"],
)
def test_amount_string_must_match_the_published_pattern(amount: str) -> None:
    with pytest.raises(ValidationError):
        Money.model_validate({"amount": amount, "currency": "EUR"})
    with pytest.raises(ValidationError):
        ContractCreate.model_validate(
            {
                "category_id": CAT,
                "name": "x",
                "amount": amount,
                "currency": "EUR",
                "frequency": "monthly",
                "start_date": "2026-01-01",
            }
        )


def test_amount_plain_strings_are_accepted() -> None:
    assert Money.model_validate({"amount": "12.50", "currency": "EUR"}).amount == Decimal("12.50")
    assert Money.model_validate({"amount": "7", "currency": "JPY"}).amount == Decimal(7)


def test_four_decimal_currencies() -> None:
    assert (minor_units("CLF"), minor_units("UYW")) == (4, 4)
    assert validate_amount(Decimal("1.2345"), "CLF") == Decimal("1.2345")
    with pytest.raises(ValueError):
        validate_amount(Decimal("1.23456"), "UYW")
    out = json.loads(MoneyBase(amount=Decimal("1.5"), currency="CLF").model_dump_json())
    assert out["amount"] == "1.5000"
