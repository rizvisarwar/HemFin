from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, SecretStr, StringConstraints

from hemfin.modules.invitations.models import InvitationStatus
from hemfin.modules.spaces.models import Role

# Deliberately simple: delivery is the real check. No third-party validator needed.
Email = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        max_length=254,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    ),
]


class InvitationCreate(BaseModel):
    email: Email
    role: Literal[Role.admin, Role.member] = Role.member


class InvitationOut(BaseModel):
    """Never carries the token or its hash."""

    id: UUID
    email: str
    role: Role
    status: InvitationStatus
    invited_by: UUID
    expires_at: datetime
    created_at: datetime
    responded_at: datetime | None


class TokenBody(BaseModel):
    """The raw invite token, sent in the body only. SecretStr keeps it out of reprs and logs."""

    token: Annotated[SecretStr, StringConstraints(min_length=1, max_length=256)]


class InvitationPreview(BaseModel):
    household_name: str
    inviter_name: str | None


class InvitationAccepted(BaseModel):
    space_id: UUID
    household_name: str
    role: Role
