from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from hemfin.modules.spaces.models import Role, SpaceType

SpaceName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class SpaceOut(BaseModel):
    id: UUID
    type: SpaceType
    name: str
    role: Role
    created_at: datetime


class SpaceListItem(SpaceOut):
    member_count: int


class SpaceCreate(BaseModel):
    name: SpaceName


class SpaceRename(BaseModel):
    name: SpaceName


class MemberOut(BaseModel):
    user_id: UUID
    display_name: str | None
    email: str
    role: Role
    joined_at: datetime


class MemberRoleChange(BaseModel):
    role: Role  # `owner` is rejected by the service; use transfer-ownership


class TransferOwnership(BaseModel):
    user_id: UUID
