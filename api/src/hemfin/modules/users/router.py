from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.db import get_session
from hemfin.core.deps import get_current_user
from hemfin.core.errors import PROBLEM_JSON
from hemfin.modules.spaces import service as spaces_service
from hemfin.modules.spaces.models import SpaceType
from hemfin.modules.spaces.schemas import SpaceOut
from hemfin.modules.users.service import CurrentUser

router = APIRouter(tags=["me"])


class MeOut(BaseModel):
    id: UUID
    email: str
    display_name: str | None
    spaces: list[SpaceOut]


@router.get(
    "/me",
    summary="Current user with their spaces and roles",
    responses={401: {"description": "Not authenticated", "content": {PROBLEM_JSON: {}}}},
)
async def get_me(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MeOut:
    spaces = await spaces_service.list_user_spaces(session, user.id)
    return MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        spaces=[
            SpaceOut(
                id=s.id,
                type=SpaceType(s.type),
                name=s.name,
                role=role,
                created_at=s.created_at,
            )
            for s, role in spaces
        ],
    )
