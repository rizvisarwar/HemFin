import json
from decimal import Decimal

import pytest
from pydantic import ValidationError

from hemfin.core.money import AmountIn, MoneyBase, validate_amount
from hemfin.modules.contracts.schemas import ContractCreate, ContractPatch

CAT = "6f1c2d0e-5a4b-4c8e-9a57-3b1e0f7d2c11"


@pytest.mark.parametrize("amount", ["12.34", "12.3", "100", "12.3400", "0.01"])
def test_valid(amount: str) -> None:
    assert validate_amount(Decimal(amount)) == Decimal(amount)


@pytest.mark.parametrize(
    "amount",
    [
        "0",
        "-1",
        "12.345",
        "NaN",
        "Infinity",
        "100000000000000",
        # Excess decimals beyond the 28-digit default context must not be rounded away.
        "10.0000000000000000000000000001",
    ],
)
def test_invalid(amount: str) -> None:
    with pytest.raises(ValueError):
        validate_amount(Decimal(amount))


def test_amount_input_and_money_output() -> None:
    assert AmountIn(amount=Decimal("12.5")).amount == Decimal("12.5")
    out = json.loads(MoneyBase(amount=Decimal("12.5000")).model_dump_json())
    assert out == {"amount": "12.50", "currency": "SEK"}
    # A stored row with another code keeps displaying its own.
    other = json.loads(MoneyBase(amount=Decimal("5"), currency="EUR").model_dump_json())
    assert other == {"amount": "5.00", "currency": "EUR"}


def test_amount_rejects_three_decimals() -> None:
    with pytest.raises(ValidationError):
        AmountIn(amount=Decimal("1.001"))


def _create(**kw: object) -> ContractCreate:
    base: dict[str, object] = {
        "category_id": CAT,
        "name": "Home",
        "amount": "10.00",
        "frequency": "monthly",
        "start_date": "2026-01-01",
    }
    return ContractCreate.model_validate({**base, **kw})


def test_contract_create_rules() -> None:
    assert _create().amount == Decimal("10.00")
    for bad in (
        {"end_date": "2025-12-31"},
        {"amount": "0"},
        {"amount": "1.234"},
        {"frequency": "daily"},
        {"renewal_term_months": 0},
        {"notice_period_days": -1},
        {"name": "  "},
        {"start_date": "1800-01-01"},
    ):
        with pytest.raises(ValidationError):
            _create(**bad)


def test_contract_create_ignores_a_currency_input() -> None:
    c = _create(currency="EUR")
    assert not hasattr(c, "currency")


def test_contract_patch_rules() -> None:
    assert ContractPatch.model_validate({"notes": None}).model_fields_set == {"notes"}
    for bad in ({"name": None}, {"amount": None}, {"amount": "1.234"}):
        with pytest.raises(ValidationError):
            ContractPatch.model_validate(bad)


@pytest.mark.parametrize("bad", [12.5, 12, True])
def test_amount_rejects_json_numbers(bad: object) -> None:
    with pytest.raises(ValidationError):
        AmountIn.model_validate({"amount": bad})
    with pytest.raises(ValidationError):
        ContractPatch.model_validate({"amount": bad})


def test_amount_openapi_input_is_string_only() -> None:
    assert AmountIn.model_json_schema()["properties"]["amount"]["type"] == "string"


def test_patch_amount_precision_bypass_rejected() -> None:
    with pytest.raises(ValidationError):
        ContractPatch.model_validate({"amount": "10.0000000000000000000000000001"})
