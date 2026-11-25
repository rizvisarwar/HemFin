"""Profile and address rules. Nothing here logs phone numbers or addresses."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.modules.profile.models import Address, Profile
from hemfin.modules.profile.schemas import AddressIn, AddressPatch, ProfilePatch
from hemfin.modules.users.models import User

MAX_ADDRESSES_PER_USER = 20
DEFAULT_INDEX = "uq_addresses_one_default_per_user"


def _is_default_conflict(exc: IntegrityError) -> bool:
    """True only for the one-default-per-user unique index; other violations are real bugs."""
    cause = getattr(exc.orig, "__cause__", None)
    name = getattr(cause, "constraint_name", None) or getattr(exc.orig, "constraint_name", None)
    return name == DEFAULT_INDEX or DEFAULT_INDEX in str(exc.orig)


async def get_profile(session: AsyncSession, user_id: UUID) -> Profile:
    """Return the profile, creating the default one (EUR, en) on first access."""
    await session.execute(
        pg_insert(Profile)
        .values(user_id=user_id)
        .on_conflict_do_nothing(index_elements=["user_id"])
    )
    await session.commit()
    profile = (
        await session.execute(
            select(Profile)
            .where(Profile.user_id == user_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return profile


async def update_profile(session: AsyncSession, user_id: UUID, patch: ProfilePatch) -> Profile:
    await get_profile(session, user_id)
    values = {name: getattr(patch, name) for name in patch.model_fields_set}
    if values:
        await session.execute(update(Profile).where(Profile.user_id == user_id).values(**values))
        await session.commit()
    return await get_profile(session, user_id)


async def list_addresses(session: AsyncSession, user_id: UUID) -> list[Address]:
    rows = await session.execute(
        select(Address)
        .where(Address.user_id == user_id)
        .order_by(Address.is_default.desc(), Address.created_at, Address.id)
    )
    return list(rows.scalars())


async def _lock_user(session: AsyncSession, user_id: UUID) -> None:
    """Serialise address changes per user (default flag, address cap)."""
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())


async def _get_owned(session: AsyncSession, user_id: UUID, address_id: UUID) -> Address:
    address = (
        await session.execute(
            select(Address)
            .where(Address.id == address_id, Address.user_id == user_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if address is None:  # also covers another user's address: never revealed
        raise HTTPException(404, detail="Address not found.")
    return address


async def _clear_default(session: AsyncSession, user_id: UUID, except_id: UUID | None) -> None:
    stmt = update(Address).where(Address.user_id == user_id, Address.is_default.is_(True))
    if except_id is not None:
        stmt = stmt.where(Address.id != except_id)
    await session.execute(stmt.values(is_default=False))


async def create_address(session: AsyncSession, user_id: UUID, data: AddressIn) -> Address:
    await _lock_user(session, user_id)
    count = (
        await session.execute(
            select(func.count()).select_from(Address).where(Address.user_id == user_id)
        )
    ).scalar_one()
    if count >= MAX_ADDRESSES_PER_USER:
        await session.rollback()
        raise HTTPException(409, detail=f"At most {MAX_ADDRESSES_PER_USER} addresses are allowed.")
    make_default = data.is_default or count == 0  # the first address is the default
    if make_default:
        await _clear_default(session, user_id, None)
    address = Address(user_id=user_id, **data.model_dump(exclude={"is_default"}))
    address.is_default = make_default
    session.add(address)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if not _is_default_conflict(exc):
            raise
        raise HTTPException(409, detail="Could not save the address, please retry.") from None
    await session.refresh(address)
    return address


async def update_address(
    session: AsyncSession, user_id: UUID, address_id: UUID, patch: AddressPatch
) -> Address:
    address = await _get_owned(session, user_id, address_id)
    for name in patch.model_fields_set:
        setattr(address, name, getattr(patch, name))
    await session.commit()
    await session.refresh(address)
    return address


async def delete_address(session: AsyncSession, user_id: UUID, address_id: UUID) -> None:
    address = await _get_owned(session, user_id, address_id)
    await session.delete(address)
    await session.commit()


async def set_default_address(session: AsyncSession, user_id: UUID, address_id: UUID) -> Address:
    await _lock_user(session, user_id)
    address = await _get_owned(session, user_id, address_id)
    await _clear_default(session, user_id, address_id)
    address.is_default = True
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if not _is_default_conflict(exc):
            raise
        raise HTTPException(409, detail="Could not change the default, please retry.") from None
    await session.refresh(address)
    return address
