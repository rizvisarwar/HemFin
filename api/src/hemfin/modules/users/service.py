from dataclasses import dataclass
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.security import TokenClaims
from hemfin.modules.spaces.models import Role, Space, SpaceMembership, SpaceType
from hemfin.modules.users.models import User

PERSONAL_SPACE_NAME = "Personal"


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str
    display_name: str | None


async def _has_personal_space(session: AsyncSession, user_id: UUID) -> bool:
    row = await session.execute(
        select(Space.id).where(Space.created_by == user_id, Space.type == SpaceType.personal)
    )
    return row.first() is not None


async def ensure_user(session: AsyncSession, claims: TokenClaims) -> CurrentUser:
    """Return the user, creating the user row and personal space on first sight.

    Idempotent and race-safe: every insert is ON CONFLICT DO NOTHING, and the partial unique
    index guarantees one personal space per user, so concurrent first requests converge on a
    single user, a single personal space and a single owner membership.
    """
    user = await session.get(User, claims.sub)
    if user is not None and await _has_personal_space(session, claims.sub):
        if user.email != claims.email:
            await session.execute(
                update(User).where(User.id == claims.sub).values(email=claims.email)
            )
            await session.commit()
            user.email = claims.email
        return CurrentUser(user.id, user.email, user.display_name)

    await session.execute(
        pg_insert(User)
        .values(id=claims.sub, email=claims.email)
        .on_conflict_do_nothing(index_elements=[User.id])
    )
    space_id = (
        await session.execute(
            pg_insert(Space)
            .values(
                id=uuid4(),
                type=SpaceType.personal,
                name=PERSONAL_SPACE_NAME,
                created_by=claims.sub,
            )
            .on_conflict_do_nothing(
                index_elements=[Space.created_by],
                index_where=Space.type == SpaceType.personal,
            )
            .returning(Space.id)
        )
    ).scalar_one_or_none()
    if space_id is not None:  # this request created the space, so it adds the owner membership
        await session.execute(
            pg_insert(SpaceMembership)
            .values(id=uuid4(), space_id=space_id, user_id=claims.sub, role=Role.owner)
            .on_conflict_do_nothing(constraint="uq_space_memberships_space_user")
        )
    await session.commit()
    user = await session.get(User, claims.sub, populate_existing=True)
    assert user is not None
    return CurrentUser(user.id, user.email, user.display_name)
