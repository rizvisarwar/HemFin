from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from hemfin.modules.spaces.models import Role, SpaceType


class SpaceOut(BaseModel):
    id: UUID
    type: SpaceType
    name: str
    role: Role
    created_at: datetime
