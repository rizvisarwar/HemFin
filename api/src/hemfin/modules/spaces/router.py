from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.db import get_session
from hemfin.core.deps import SpaceAccess, get_current_user, require_space_member
from hemfin.core.errors import PROBLEM_JSON
from hemfin.core.pagination import DEFAULT_LIMIT, CursorParam, LimitParam, Page
from hemfin.modules.spaces import service
from hemfin.modules.spaces.models import Role, SpaceType
from hemfin.modules.spaces.schemas import (
    MemberOut,
    MemberRoleChange,
    SpaceCreate,
    SpaceListItem,
    SpaceOut,
    SpaceRename,
    TransferOwnership,
)
from hemfin.modules.users.service import CurrentUser

router = APIRouter(prefix="/spaces", tags=["spaces"])

_PROBLEM: dict[str, Any] = {"content": {PROBLEM_JSON: {}}}
_401: dict[int | str, dict[str, Any]] = {401: {"description": "Not authenticated", **_PROBLEM}}
_404: dict[int | str, dict[str, Any]] = {
    404: {"description": "Unknown space or not a member", **_PROBLEM}
}
_403: dict[int | str, dict[str, Any]] = {403: {"description": "Insufficient role", **_PROBLEM}}
_409: dict[int | str, dict[str, Any]] = {409: {"description": "Rule conflict", **_PROBLEM}}

Session = Annotated[AsyncSession, Depends(get_session)]
Member = Annotated[SpaceAccess, Depends(require_space_member(Role.member))]
Admin = Annotated[SpaceAccess, Depends(require_space_member(Role.admin))]
Owner = Annotated[SpaceAccess, Depends(require_space_member(Role.owner))]


def _space_out(space: Any, role: Role) -> SpaceOut:
    return SpaceOut(
        id=space.id,
        type=SpaceType(space.type),
        name=space.name,
        role=role,
        created_at=space.created_at,
    )


@router.post(
    "",
    status_code=201,
    summary="Create a household (the caller becomes owner)",
    responses={**_401, **_409},
)
async def create_space(
    body: SpaceCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Session,
) -> SpaceOut:
    space = await service.create_household(session, user.id, body.name)
    return _space_out(space, Role.owner)


@router.get("", summary="List the caller's spaces", responses=_401)
async def list_spaces(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Session,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
) -> Page[SpaceListItem]:
    items, nxt = await service.list_spaces_page(session, user.id, limit, cursor)
    return Page[SpaceListItem](items=items, next_cursor=nxt)


@router.get(
    "/{space_id}",
    summary="Get a space the caller is a member of",
    responses={**_401, **_404},
)
async def get_space(access: Member, session: Session) -> SpaceOut:
    space = await service.get_space(session, access.space_id)
    if space is None:  # membership rows cascade with spaces; defensive only
        raise HTTPException(404, detail="Space not found.")
    return _space_out(space, access.role)


@router.patch(
    "/{space_id}",
    summary="Rename a household (admin or owner)",
    responses={**_401, **_403, **_404, **_409},
)
async def rename_space(
    body: SpaceRename,
    access: Admin,
    session: Session,
) -> SpaceOut:
    space = await service.rename_household(session, access.space_id, access.user_id, body.name)
    return _space_out(space, access.role)


@router.delete(
    "/{space_id}",
    status_code=204,
    summary="Delete a household (owner only)",
    responses={**_401, **_403, **_404, **_409},
)
async def delete_space(access: Owner, session: Session) -> Response:
    await service.delete_household(session, access.space_id, access.user_id)
    return Response(status_code=204)


@router.get(
    "/{space_id}/members",
    summary="List the members of a space",
    responses={**_401, **_404},
)
async def list_members(
    access: Member,
    session: Session,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
) -> Page[MemberOut]:
    items, nxt = await service.list_members_page(session, access.space_id, limit, cursor)
    return Page[MemberOut](items=items, next_cursor=nxt)


@router.patch(
    "/{space_id}/members/{user_id}",
    summary="Change a member's role (owner only)",
    responses={**_401, **_403, **_404, **_409},
)
async def change_member_role(
    user_id: UUID,
    body: MemberRoleChange,
    access: Owner,
    session: Session,
) -> Response:
    await service.change_member_role(session, access.space_id, access.user_id, user_id, body.role)
    return Response(status_code=204)


@router.delete(
    "/{space_id}/members/{user_id}",
    status_code=204,
    summary="Remove a member, or leave the space",
    responses={**_401, **_403, **_404, **_409},
)
async def remove_member(user_id: UUID, access: Member, session: Session) -> Response:
    await service.remove_member(session, access.space_id, access.user_id, user_id)
    return Response(status_code=204)


@router.post(
    "/{space_id}/transfer-ownership",
    status_code=204,
    summary="Transfer ownership to another member (owner only)",
    responses={**_401, **_403, **_404, **_409},
)
async def transfer_ownership(body: TransferOwnership, access: Owner, session: Session) -> Response:
    await service.transfer_ownership(session, access.space_id, access.user_id, body.user_id)
    return Response(status_code=204)
