from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.db import get_session
from hemfin.core.deps import get_current_user
from hemfin.core.errors import PROBLEM_JSON
from hemfin.modules.profile import service
from hemfin.modules.profile.schemas import (
    AddressIn,
    AddressOut,
    AddressPatch,
    ProfileOut,
    ProfilePatch,
)
from hemfin.modules.users.service import CurrentUser

router = APIRouter(prefix="/me", tags=["profile"])

User = Annotated[CurrentUser, Depends(get_current_user)]
Session = Annotated[AsyncSession, Depends(get_session)]

_P: dict[str, Any] = {"content": {PROBLEM_JSON: {}}}
_AUTH: dict[int | str, dict[str, Any]] = {401: {"description": "Not authenticated", **_P}}
_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    **_AUTH,
    404: {"description": "Address not found (or not yours)", **_P},
}


def _profile_out(p: Any) -> ProfileOut:
    return ProfileOut(
        phone_e164=p.phone_e164,
        base_currency=p.base_currency,
        locale=p.locale,
        updated_at=p.updated_at,
    )


@router.get("/profile", summary="Get my profile", responses=_AUTH)
async def get_profile(user: User, session: Session) -> ProfileOut:
    return _profile_out(await service.get_profile(session, user.id))


@router.patch("/profile", summary="Update my profile", responses=_AUTH)
async def patch_profile(body: ProfilePatch, user: User, session: Session) -> ProfileOut:
    return _profile_out(await service.update_profile(session, user.id, body))


@router.get("/addresses", summary="List my addresses", responses=_AUTH)
async def list_addresses(user: User, session: Session) -> list[AddressOut]:
    rows = await service.list_addresses(session, user.id)
    return [AddressOut.model_validate(r, from_attributes=True) for r in rows]


@router.post("/addresses", status_code=201, summary="Add an address", responses=_AUTH)
async def create_address(body: AddressIn, user: User, session: Session) -> AddressOut:
    address = await service.create_address(session, user.id, body)
    return AddressOut.model_validate(address, from_attributes=True)


@router.patch("/addresses/{address_id}", summary="Update an address", responses=_NOT_FOUND)
async def patch_address(
    address_id: UUID, body: AddressPatch, user: User, session: Session
) -> AddressOut:
    address = await service.update_address(session, user.id, address_id, body)
    return AddressOut.model_validate(address, from_attributes=True)


@router.delete(
    "/addresses/{address_id}", status_code=204, summary="Delete an address", responses=_NOT_FOUND
)
async def delete_address(address_id: UUID, user: User, session: Session) -> Response:
    await service.delete_address(session, user.id, address_id)
    return Response(status_code=204)


@router.post(
    "/addresses/{address_id}/default", summary="Make an address my default", responses=_NOT_FOUND
)
async def make_default(address_id: UUID, user: User, session: Session) -> AddressOut:
    address = await service.set_default_address(session, user.id, address_id)
    return AddressOut.model_validate(address, from_attributes=True)
