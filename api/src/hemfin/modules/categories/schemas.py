import enum
import re
import unicodedata
from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    StringConstraints,
    model_validator,
)


class CategoryKind(enum.StrEnum):
    expense = "expense"
    income = "income"


# Lower-case dotted path, for example `pets` or `pets.vet`.
CategoryKey = Annotated[
    str,
    BeforeValidator(lambda v: v.strip().lower() if isinstance(v, str) else v),
    StringConstraints(
        min_length=1,
        max_length=60,
        pattern=r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$",
    ),
]
CategoryName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


def slugify(name: str) -> str:
    """`Pet care & vets` -> `pet_care_vets`. Empty if nothing usable is left."""
    ascii_ = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", ascii_.lower()).strip("_")


class CategoryCreate(BaseModel):
    name: CategoryName
    kind: CategoryKind
    # Optional: derived from `name` when omitted (a leading digit gets a `c_` prefix).
    key: CategoryKey | None = None
    parent_key: CategoryKey | None = None

    @model_validator(mode="after")
    def _derive_key(self) -> "CategoryCreate":
        if self.key is None:
            slug = slugify(self.name)
            if not slug:
                raise ValueError("Cannot derive a key from this name; provide `key`.")
            if not slug[0].isalpha():
                slug = f"c_{slug}"
            self.key = slug[:60].rstrip("_")
        return self


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    key: str
    name: str  # display name, for example "Home insurance"
    parent_key: str | None
    kind: CategoryKind
    # True for seeded categories shared by every space; they cannot be deleted.
    system: bool
