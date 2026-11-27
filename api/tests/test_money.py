import json
from decimal import Decimal

import pytest
from pydantic import ValidationError

from hemfin.core.money import Money, MoneyBase, minor_units, validate_amount
from hemfin.modules.contracts.schemas import ContractCreate, ContractPatch

CAT = "6f1c2d0e-5a4b-4c8e-9a57-3b1e0f7d2c11"


def test_minor_units() -> None:
    assert (minor_units("JPY"), minor_units("EUR"), minor_units("kwd")) == (0, 2, 3)


@pytest.mark.parametrize(
    ("amount", "currency"),
    [("12.34", "EUR"), ("12.3", "EUR"), ("100", "JPY"), ("1.234", "KWD"), ("12.3400", "EUR")],
)
def test_valid(amount: str, currency: str) -> None:
    assert validate_amount(Decimal(amount), currency) == Decimal(amount)


@pytest.mark.parametrize(
    ("amount", "currency"),
    [
        ("0", "EUR"),
        ("-1", "EUR"),
        ("12.345", "EUR"),
        ("10.5", "JPY"),
        ("NaN", "EUR"),
        ("Infinity", "EUR"),
        ("100000000000000", "EUR"),
        # Excess decimals beyond the 28-digit default context must not be rounded away.
        ("100.0000000000000000000000000001", "JPY"),
        ("10.0000000000000000000000000001", "EUR"),
    ],
)
def test_invalid(amount: str, currency: str) -> None:
    with pytest.raises(ValueError):
        validate_amount(Decimal(amount), currency)


def test_money_input_and_string_output() -> None:
    m = Money(amount=Decimal("12.5"), currency="eur")
    assert m.currency == "EUR"
    out = json.loads(MoneyBase(amount=Decimal("12.5000"), currency="EUR").model_dump_json())
    assert out == {"amount": "12.50", "currency": "EUR"}
    jpy = json.loads(MoneyBase(amount=Decimal("1200.0000"), currency="JPY").model_dump_json())
    assert jpy["amount"] == "1200"


def test_money_rejects_bad_currency_and_amount() -> None:
    with pytest.raises(ValidationError):
        Money(amount=Decimal("1"), currency="XXQ")
    with pytest.raises(ValidationError):
        Money(amount=Decimal("1.001"), currency="EUR")


def _create(**kw: object) -> ContractCreate:
    base: dict[str, object] = {
        "category_id": CAT,
        "name": "Home",
        "amount": "10.00",
        "currency": "EUR",
        "frequency": "monthly",
        "start_date": "2026-01-01",
    }
    return ContractCreate.model_validate({**base, **kw})


def test_contract_create_rules() -> None:
    assert _create().amount == Decimal("10.00")
    for bad in (
        {"end_date": "2025-12-31"},
        {"amount": "0"},
        {"currency": "JPY", "amount": "1.5"},
        {"frequency": "daily"},
        {"renewal_term_months": 0},
        {"notice_period_days": -1},
        {"name": "  "},
        {"start_date": "1800-01-01"},
    ):
        with pytest.raises(ValidationError):
            _create(**bad)


def test_contract_patch_rules() -> None:
    assert ContractPatch.model_validate({"notes": None}).model_fields_set == {"notes"}
    for bad in ({"name": None}, {"amount": None}, {"amount": "1.234", "currency": "EUR"}):
        with pytest.raises(ValidationError):
            ContractPatch.model_validate(bad)


@pytest.mark.parametrize("bad", [12.5, 12, True])
def test_amount_rejects_json_numbers(bad: object) -> None:
    with pytest.raises(ValidationError):
        Money.model_validate({"amount": bad, "currency": "EUR"})
    with pytest.raises(ValidationError):
        ContractPatch.model_validate({"amount": bad})


def test_amount_openapi_input_is_string_only() -> None:
    assert Money.model_json_schema()["properties"]["amount"]["type"] == "string"


def test_patch_amount_precision_bypass_rejected() -> None:
    with pytest.raises(ValidationError):
        ContractPatch.model_validate(
            {"amount": "10.0000000000000000000000000001", "currency": "EUR"}
        )
