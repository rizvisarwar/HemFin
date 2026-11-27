from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.db import get_session
from hemfin.core.deps import SpaceAccess, require_space_member
from hemfin.core.errors import PROBLEM_JSON
from hemfin.core.pagination import Page
from hemfin.modules.categories import service
from hemfin.modules.categories.schemas import CategoryCreate, CategoryOut

router = APIRouter(prefix="/spaces/{space_id}/categories", tags=["categories"])

Session = Annotated[AsyncSession, Depends(get_session)]
Member = Annotated[SpaceAccess, Depends(require_space_member())]

_P: dict[str, Any] = {"content": {PROBLEM_JSON: {}}}
_404: dict[int | str, dict[str, Any]] = {404: {"description": "Not a member, or not found", **_P}}
_409: dict[int | str, dict[str, Any]] = {
    409: {
        "description": "Conflict; `code` is category_exists, category_limit, "
        "system_category or category_in_use",
        **_P,
    }
}
_422: dict[int | str, dict[str, Any]] = {422: {"description": "Validation error", **_P}}


@router.get("", summary="System categories plus this space's own", responses=_404)
async def list_categories(access: Member, session: Session) -> Page[CategoryOut]:
    # A bounded reference list (seed list plus at most 100 custom), so one page, no cursor.
    items = await service.list_categories(session, access.space_id)
    return Page[CategoryOut](items=items, next_cursor=None)


@router.post(
    "",
    status_code=201,
    summary="Create a custom category for this space",
    responses={**_404, **_409, **_422},
)
async def create_category(body: CategoryCreate, access: Member, session: Session) -> CategoryOut:
    return await service.create_category(session, access.space_id, body)


@router.delete(
    "/{category_id}",
    status_code=204,
    summary="Delete a custom category (not a system one, not one in use)",
    responses={**_404, **_409},
)
async def delete_category(category_id: UUID, access: Member, session: Session) -> Response:
    await service.delete_category(session, access.space_id, category_id)
    return Response(status_code=204)
