from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.db import get_session
from hemfin.core.deps import SpaceAccess, require_space_member
from hemfin.core.errors import PROBLEM_JSON
from hemfin.modules.spaces import service
from hemfin.modules.spaces.models import Role, SpaceType
from hemfin.modules.spaces.schemas import SpaceOut

router = APIRouter(prefix="/spaces", tags=["spaces"])

_PROBLEM: dict[str, Any] = {"content": {PROBLEM_JSON: {}}}


@router.get(
    "/{space_id}",
    summary="Get a space the caller is a member of",
    responses={
        401: {"description": "Not authenticated", **_PROBLEM},
        404: {"description": "Unknown space or not a member", **_PROBLEM},
    },
)
async def get_space(
    access: Annotated[SpaceAccess, Depends(require_space_member(Role.member))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SpaceOut:
    space = await service.get_space(session, access.space_id)
    if space is None:  # membership rows cascade with spaces; defensive only
        raise HTTPException(404, detail="Space not found.")
    return SpaceOut(
        id=space.id,
        type=SpaceType(space.type),
        name=space.name,
        role=access.role,
        created_at=space.created_at,
    )
