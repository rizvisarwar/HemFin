import re
from datetime import datetime
from typing import Annotated
from uuid import UUID

import phonenumbers
import pycountry
from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints, model_validator


def _currency(v: str) -> str:
    code = v.strip().upper()
    if pycountry.currencies.get(alpha_3=code) is None:
        raise ValueError("Must be an ISO 4217 currency code, for example EUR.")
    return code


def _country(v: str) -> str:
    code = v.strip().upper()
    if len(code) != 2 or pycountry.countries.get(alpha_2=code) is None:
        raise ValueError("Must be an ISO 3166-1 alpha-2 country code, for example NL.")
    return code


_LOCALE_RE = re.compile(r"^([A-Za-z]{2,3})(?:-([A-Za-z]{4}))?(?:-([A-Za-z]{2}|[0-9]{3}))?$")


def _locale(v: str) -> str:
    m = _LOCALE_RE.match(v.strip())
    if m is None:
        raise ValueError("Must be a BCP-47 language tag, for example en or nl-NL.")
    lang, script, region = m.groups()
    parts = [lang.lower()]
    if script:
        parts.append(script.title())
    if region:
        parts.append(region.upper())
    return "-".join(parts)


def _phone(v: str) -> str:
    """Parse an international phone number and return E.164. The value is never echoed."""
    raw = v.strip()
    if not raw.startswith("+"):
        raise ValueError("Phone number must include the country code, for example +31612345678.")
    try:
        number = phonenumbers.parse(raw, None)
    except phonenumbers.NumberParseException:
        raise ValueError("Not a valid phone number.") from None
    if not phonenumbers.is_valid_number(number):
        raise ValueError("Not a valid phone number.")
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)


Currency = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_upper=True, min_length=3, max_length=3),
    AfterValidator(_currency),
]
Country = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_upper=True, min_length=2, max_length=2),
    AfterValidator(_country),
]
Locale = Annotated[str, StringConstraints(min_length=2, max_length=35), AfterValidator(_locale)]
Phone = Annotated[str, StringConstraints(max_length=32), AfterValidator(_phone)]


DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class ProfileOut(BaseModel):
    display_name: str | None
    phone_e164: str | None
    base_currency: str
    locale: str
    updated_at: datetime | None


class ProfilePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName | None = None  # explicit null clears the display name
    phone_e164: Phone | None = None  # explicit null clears the phone number
    base_currency: Currency | None = None
    locale: Locale | None = None

    @model_validator(mode="after")
    def _no_null_required(self) -> "ProfilePatch":
        for name in ("base_currency", "locale"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null.")
        return self


Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Line = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
City = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Region = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Postcode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]


class AddressIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: Label
    line1: Line
    line2: Line | None = None
    city: City
    region: Region | None = None
    postcode: Postcode | None = None
    country: Country
    is_default: bool = False


class AddressPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: Label | None = None
    line1: Line | None = None
    line2: Line | None = None  # explicit null clears
    city: City | None = None
    region: Region | None = None  # explicit null clears
    postcode: Postcode | None = None  # explicit null clears
    country: Country | None = None

    @model_validator(mode="after")
    def _no_null_required(self) -> "AddressPatch":
        for name in ("label", "line1", "city", "country"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null.")
        return self


class AddressOut(BaseModel):
    id: UUID
    label: str
    line1: str
    line2: str | None
    city: str
    region: str | None
    postcode: str | None
    country: str
    is_default: bool
    created_at: datetime
    updated_at: datetime
