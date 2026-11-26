from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import and_, delete, func, or_, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.pagination import decode_cursor, encode_cursor
from hemfin.modules.spaces.models import Role, Space, SpaceMembership, SpaceType
from hemfin.modules.spaces.schemas import MemberOut, SpaceListItem
from hemfin.modules.users.models import User

MAX_OWNED_HOUSEHOLDS = 10


async def list_user_spaces(session: AsyncSession, user_id: UUID) -> list[tuple[Space, Role]]:
    rows = await session.execute(
        select(Space, SpaceMembership.role)
        .join(SpaceMembership, SpaceMembership.space_id == Space.id)
        .where(SpaceMembership.user_id == user_id)
        .order_by(Space.type, Space.created_at)  # household < personal; stable by creation
    )
    return [(space, Role(role)) for space, role in rows.all()]


async def get_space(session: AsyncSession, space_id: UUID) -> Space | None:
    return await session.get(Space, space_id)


# --- listing ---------------------------------------------------------------------------------


async def list_spaces_page(
    session: AsyncSession, user_id: UUID, limit: int, cursor: str | None
) -> tuple[list[SpaceListItem], str | None]:
    mine = select(SpaceMembership.space_id).where(SpaceMembership.user_id == user_id)
    counts = (
        select(SpaceMembership.space_id, func.count().label("n"))
        .where(SpaceMembership.space_id.in_(mine))
        .group_by(SpaceMembership.space_id)
        .subquery()
    )
    stmt = (
        select(Space, SpaceMembership.role, counts.c.n)
        .join(SpaceMembership, SpaceMembership.space_id == Space.id)
        .join(counts, counts.c.space_id == Space.id)
        .where(SpaceMembership.user_id == user_id)
        .order_by(Space.created_at, Space.id)
        .limit(limit + 1)
    )
    if cursor:
        at, rid = decode_cursor(cursor)
        stmt = stmt.where(tuple_(Space.created_at, Space.id) > tuple_(at, rid))
    rows = (await session.execute(stmt)).all()
    page = rows[:limit]
    items = [
        SpaceListItem(
            id=s.id,
            type=SpaceType(s.type),
            name=s.name,
            role=Role(role),
            created_at=s.created_at,
            member_count=n,
        )
        for s, role, n in page
    ]
    nxt = encode_cursor(page[-1][0].created_at, page[-1][0].id) if len(rows) > limit else None
    return items, nxt


async def list_members_page(
    session: AsyncSession, space_id: UUID, limit: int, cursor: str | None
) -> tuple[list[MemberOut], str | None]:
    stmt = (
        select(SpaceMembership, User)
        .join(User, User.id == SpaceMembership.user_id)
        .where(SpaceMembership.space_id == space_id)
        .order_by(SpaceMembership.created_at, SpaceMembership.id)
        .limit(limit + 1)
    )
    if cursor:
        at, rid = decode_cursor(cursor)
        stmt = stmt.where(
            or_(
                SpaceMembership.created_at > at,
                and_(SpaceMembership.created_at == at, SpaceMembership.id > rid),
            )
        )
    rows = (await session.execute(stmt)).all()
    page = rows[:limit]
    items = [
        MemberOut(
            user_id=m.user_id,
            display_name=u.display_name,
            email=u.email,
            role=Role(m.role),
            joined_at=m.created_at,
        )
        for m, u in page
    ]
    nxt = encode_cursor(page[-1][0].created_at, page[-1][0].id) if len(rows) > limit else None
    return items, nxt


# --- household lifecycle -----------------------------------------------------------------------


async def create_household(session: AsyncSession, user_id: UUID, name: str) -> Space:
    # Serialise creations per user so the cap cannot be exceeded by concurrent requests.
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())
    if await _owned_household_count(session, user_id) >= MAX_OWNED_HOUSEHOLDS:
        raise HTTPException(409, detail=f"At most {MAX_OWNED_HOUSEHOLDS} households are allowed.")
    space = Space(id=uuid4(), type=SpaceType.household, name=name, created_by=user_id)
    session.add(space)
    await session.flush()
    session.add(SpaceMembership(id=uuid4(), space_id=space.id, user_id=user_id, role=Role.owner))
    await session.commit()
    await session.refresh(space)
    return space


async def _owned_household_count(session: AsyncSession, user_id: UUID) -> int:
    return (
        await session.execute(
            select(func.count())
            .select_from(SpaceMembership)
            .join(Space, Space.id == SpaceMembership.space_id)
            .where(
                SpaceMembership.user_id == user_id,
                SpaceMembership.role == Role.owner,
                Space.type == SpaceType.household,
            )
        )
    ).scalar_one()


async def _lock_space(session: AsyncSession, space_id: UUID) -> Space:
    """Row-lock the space: every role change, removal, rename or delete serialises on it."""
    space = (
        await session.execute(
            select(Space)
            .where(Space.id == space_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if space is None:  # deleted concurrently
        raise HTTPException(404, detail="Space not found.")
    return space


async def _actor_role(session: AsyncSession, space_id: UUID, user_id: UUID) -> Role:
    """Re-read the caller's role under the space lock (the dependency's read may be stale)."""
    value = (
        await session.execute(
            select(SpaceMembership.role)
            .where(SpaceMembership.space_id == space_id, SpaceMembership.user_id == user_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if value is None:  # removed concurrently: same as a non-member
        raise HTTPException(404, detail="Space not found.")
    return Role(value)


def _require_household(space: Space, action: str) -> None:
    if space.type != SpaceType.household:
        raise HTTPException(409, detail=f"A personal space cannot be {action}.")


def _require_rank(role: Role, minimum: Role) -> None:
    if role.rank < minimum.rank:
        raise HTTPException(403, detail="Insufficient role for this action.")


async def rename_household(session: AsyncSession, space_id: UUID, actor: UUID, name: str) -> Space:
    space = await _lock_space(session, space_id)
    _require_rank(await _actor_role(session, space_id, actor), Role.admin)
    _require_household(space, "renamed")
    space.name = name
    await session.commit()
    return space


async def delete_household(session: AsyncSession, space_id: UUID, actor: UUID) -> None:
    space = await _lock_space(session, space_id)
    _require_rank(await _actor_role(session, space_id, actor), Role.owner)
    _require_household(space, "deleted")
    # Memberships go with the space via ON DELETE CASCADE.
    await session.delete(space)
    await session.commit()


# --- members -----------------------------------------------------------------------------------


async def _target_membership(
    session: AsyncSession, space_id: UUID, user_id: UUID
) -> SpaceMembership:
    m = (
        await session.execute(
            select(SpaceMembership)
            .where(SpaceMembership.space_id == space_id, SpaceMembership.user_id == user_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if m is None:
        raise HTTPException(404, detail="Member not found.")
    return m


async def change_member_role(
    session: AsyncSession, space_id: UUID, actor: UUID, target: UUID, new_role: Role
) -> None:
    await _lock_space(session, space_id)
    _require_rank(await _actor_role(session, space_id, actor), Role.owner)
    if new_role == Role.owner:
        raise HTTPException(422, detail="Use transfer-ownership to change the owner.")
    m = await _target_membership(session, space_id, target)
    if m.role == Role.owner:
        raise HTTPException(409, detail="The owner's role changes only by transferring ownership.")
    m.role = new_role
    await session.commit()


async def remove_member(session: AsyncSession, space_id: UUID, actor: UUID, target: UUID) -> None:
    await _lock_space(session, space_id)
    actor_role = await _actor_role(session, space_id, actor)
    m = await _target_membership(session, space_id, target)
    if target == actor:
        if actor_role == Role.owner:
            raise HTTPException(409, detail="Transfer ownership before leaving.")
    else:
        _require_rank(actor_role, Role.admin)
        if actor_role == Role.admin and Role(m.role).rank >= Role.admin.rank:
            raise HTTPException(403, detail="Insufficient role for this action.")
    await session.execute(delete(SpaceMembership).where(SpaceMembership.id == m.id))
    await session.commit()


async def transfer_ownership(
    session: AsyncSession, space_id: UUID, actor: UUID, target: UUID
) -> None:
    space = await _lock_space(session, space_id)
    _require_rank(await _actor_role(session, space_id, actor), Role.owner)
    _require_household(space, "transferred")
    if target == actor:
        raise HTTPException(409, detail="You already own this household.")
    await _target_membership(session, space_id, target)
    # Serialise with the target's own household creations, then enforce the cap.
    await session.execute(select(User.id).where(User.id == target).with_for_update())
    if await _owned_household_count(session, target) >= MAX_OWNED_HOUSEHOLDS:
        raise HTTPException(409, detail="That member cannot take ownership of another household.")
    await session.execute(
        update(SpaceMembership)
        .where(SpaceMembership.space_id == space_id, SpaceMembership.user_id == actor)
        .values(role=Role.admin)
    )
    await session.execute(
        update(SpaceMembership)
        .where(SpaceMembership.space_id == space_id, SpaceMembership.user_id == target)
        .values(role=Role.owner)
    )
    await session.commit()
