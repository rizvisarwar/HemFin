import httpx
import pytest
from pydantic import ValidationError

from hemfin.modules.profile.schemas import AddressIn, AddressPatch, ProfilePatch


def test_phone_normalised_to_e164() -> None:
    assert ProfilePatch(phone_e164="+31 6 12345678").phone_e164 == "+31612345678"
    assert ProfilePatch(phone_e164="+1 (415) 555-2671").phone_e164 == "+14155552671"


@pytest.mark.parametrize("bad", ["0698765432", "+31", "+999999999999", "abc", "+1 123", ""])
def test_phone_invalid(bad: str) -> None:
    with pytest.raises(ValidationError) as exc:
        ProfilePatch(phone_e164=bad)
    err = exc.value.errors()[0]
    assert err["loc"] == ("phone_e164",)
    assert err["type"] == "value_error"  # our validator, not a length or type error
    assert bad == "" or bad not in str(err["msg"])  # value is never echoed


def test_phone_null_clears() -> None:
    p = ProfilePatch.model_validate({"phone_e164": None})
    assert "phone_e164" in p.model_fields_set
    assert p.phone_e164 is None


def test_codes_are_stripped_and_upper_cased() -> None:
    assert ProfilePatch(base_currency=" eur ").base_currency == "EUR"
    assert AddressIn(label="a", line1="b", city="c", country=" nl ").country == "NL"


def test_currency_and_locale() -> None:
    p = ProfilePatch(base_currency="usd", locale="nl-nl")
    assert (p.base_currency, p.locale) == ("USD", "nl-NL")
    for bad in ("EURO", "XXQ", "e1"):
        with pytest.raises(ValidationError):
            ProfilePatch(base_currency=bad)
    for bad_locale in ("e", "english", "nl_NL", "nl-NL-x-foo-bar"):
        with pytest.raises(ValidationError):
            ProfilePatch(locale=bad_locale)
    with pytest.raises(ValidationError):
        ProfilePatch.model_validate({"base_currency": None})


def test_address_validation() -> None:
    a = AddressIn(label=" Home ", line1="Main St 1", city="Utrecht", country="nl")
    assert (a.label, a.country, a.is_default) == ("Home", "NL", False)
    for bad in (
        {"country": "XX"},
        {"country": "NLD"},
        {"label": "x" * 51},
        {"line1": "x" * 201},
        {"city": " "},
        {"postcode": "x" * 21},
        {"unknown": "field"},
    ):
        with pytest.raises(ValidationError):
            AddressIn(**{"label": "a", "line1": "b", "city": "c", "country": "NL", **bad})


def test_address_patch_cannot_null_required() -> None:
    AddressPatch.model_validate({"line2": None, "region": None})
    with pytest.raises(ValidationError):
        AddressPatch.model_validate({"city": None})


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/v1/me/profile"),
        ("PATCH", "/api/v1/me/profile"),
        ("GET", "/api/v1/me/addresses"),
        ("POST", "/api/v1/me/addresses"),
        ("PATCH", "/api/v1/me/addresses/00000000-0000-0000-0000-000000000000"),
        ("DELETE", "/api/v1/me/addresses/00000000-0000-0000-0000-000000000000"),
        ("POST", "/api/v1/me/addresses/00000000-0000-0000-0000-000000000000/default"),
    ],
)
async def test_requires_auth(aclient: httpx.AsyncClient, method: str, path: str) -> None:
    r = await aclient.request(method, path, json={})
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"


def test_display_name_is_trimmed_bounded_and_clearable() -> None:
    assert ProfilePatch(display_name="  Sam Example ").display_name == "Sam Example"
    cleared = ProfilePatch.model_validate({"display_name": None})
    assert "display_name" in cleared.model_fields_set and cleared.display_name is None
    for bad in ("", "   ", "x" * 81):
        with pytest.raises(ValidationError):
            ProfilePatch(display_name=bad)
