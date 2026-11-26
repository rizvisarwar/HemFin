"""Invitations. The raw token exists only in memory and in the email link, never in the DB,
logs, responses or a URL path/query. Only its SHA-256 is stored."""

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import func, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.email import EmailDeliveryError, EmailSender
from hemfin.core.pagination import decode_cursor, encode_cursor
from hemfin.modules.invitations.models import Invitation, InvitationStatus
from hemfin.modules.invitations.schemas import (
    InvitationAccepted,
    InvitationOut,
    InvitationPreview,
)
from hemfin.modules.spaces.models import Role, Space, SpaceMembership
from hemfin.modules.spaces.service import (
    _actor_role,
    _lock_space,
    _require_household,
    _require_rank,
)
from hemfin.modules.users.models import User

log = logging.getLogger("hemfin.invitations")

INVITATION_TTL = timedelta(days=7)
MAX_RESENDS_PER_DAY = 3
RESEND_WINDOW = timedelta(days=1)


def _generic_404() -> HTTPException:
    """The single answer for every invalid, expired, revoked, used or mismatched token."""
    return HTTPException(404, detail="Invitation not found.")


def _now() -> datetime:
    return datetime.now(UTC)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _out(i: Invitation) -> InvitationOut:
    return InvitationOut(
        id=i.id,
        email=i.email,
        role=Role(i.role),
        status=InvitationStatus(i.status),
        invited_by=i.invited_by,
        expires_at=i.expires_at,
        created_at=i.created_at,
        responded_at=i.responded_at,
    )


async def expire_due(session: AsyncSession, space_id: UUID | None = None) -> int:
    """Mark pending invitations past their expiry as expired. Does not commit."""
    stmt = (
        update(Invitation)
        .where(Invitation.status == InvitationStatus.pending, Invitation.expires_at <= _now())
        .values(status=InvitationStatus.expired, responded_at=_now())
    )
    if space_id is not None:
        stmt = stmt.where(Invitation.space_id == space_id)
    result = await session.execute(stmt)
    return int(result.rowcount)  # type: ignore[attr-defined]


async def _send(
    sender: EmailSender, *, to: str, space_name: str, inviter: str, link_base: str, token: str
) -> None:
    body = (
        f'{inviter} invited you to join the household "{space_name}" on HemFin.\n\n'
        f"Open this link while signed in with this email address to respond:\n"
        f"{link_base.rstrip('/')}/invite#token={token}\n\n"
        "The invitation expires in 7 days. If you did not expect it, ignore this email."
    )
    try:
        await sender.send(to=to, subject=f"Invitation to join {space_name}", text=body)
    except EmailDeliveryError:
        raise HTTPException(503, detail="The invitation email could not be sent.") from None


async def _inviter_name(session: AsyncSession, user_id: UUID) -> str:
    user = await session.get(User, user_id)
    return (user.display_name if user and user.display_name else None) or "A HemFin member"


# --- admin side ------------------------------------------------------------------------------


async def create_invitation(
    session: AsyncSession,
    sender: EmailSender,
    *,
    space_id: UUID,
    actor: UUID,
    email: str,
    role: Role,
    link_base: str,
) -> InvitationOut:
    space = await _lock_space(session, space_id)
    _require_rank(await _actor_role(session, space_id, actor), Role.admin)
    _require_household(space, "invited to")
    already_member = (
        await session.execute(
            select(SpaceMembership.id)
            .join(User, User.id == SpaceMembership.user_id)
            .where(SpaceMembership.space_id == space_id, func.lower(User.email) == email)
        )
    ).first()
    if already_member is not None:
        raise HTTPException(409, detail="That person is already a member of this household.")
    await expire_due(session, space_id)
    token = new_token()
    inv = Invitation(
        id=uuid4(),
        space_id=space_id,
        email=email,
        role=role,
        token_hash=hash_token(token),
        status=InvitationStatus.pending,
        invited_by=actor,
        expires_at=_now() + INVITATION_TTL,
    )
    session.add(inv)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            409, detail="An invitation is already pending for that email."
        ) from None
    # Send before committing: if delivery fails nothing is stored.
    inviter = await _inviter_name(session, actor)
    try:
        await _send(
            sender,
            to=email,
            space_name=space.name,
            inviter=inviter,
            link_base=link_base,
            token=token,
        )
    except HTTPException:
        await session.rollback()
        raise
    await session.commit()
    await session.refresh(inv)
    return _out(inv)


async def list_invitations_page(
    session: AsyncSession, space_id: UUID, limit: int, cursor: str | None
) -> tuple[list[InvitationOut], str | None]:
    if await expire_due(session, space_id):
        await session.commit()
    stmt = (
        select(Invitation)
        .where(Invitation.space_id == space_id)
        .order_by(Invitation.created_at.desc(), Invitation.id.desc())
        .limit(limit + 1)
    )
    if cursor:
        at, rid = decode_cursor(cursor)
        stmt = stmt.where(tuple_(Invitation.created_at, Invitation.id) < tuple_(at, rid))
    rows = list((await session.execute(stmt)).scalars().all())
    page = rows[:limit]
    nxt = encode_cursor(page[-1].created_at, page[-1].id) if len(rows) > limit else None
    return [_out(i) for i in page], nxt


async def _own_pending(session: AsyncSession, space_id: UUID, invitation_id: UUID) -> Invitation:
    inv = (
        await session.execute(
            select(Invitation)
            .where(Invitation.id == invitation_id, Invitation.space_id == space_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if inv is None:
        raise HTTPException(404, detail="Invitation not found.")
    if inv.status == InvitationStatus.pending and inv.expires_at <= _now():
        inv.status = InvitationStatus.expired
        inv.responded_at = _now()
        await session.commit()
    if inv.status != InvitationStatus.pending:
        raise HTTPException(409, detail="That invitation is no longer pending.")
    return inv


async def resend_invitation(
    session: AsyncSession,
    sender: EmailSender,
    *,
    space_id: UUID,
    actor: UUID,
    invitation_id: UUID,
    link_base: str,
) -> InvitationOut:
    space = await _lock_space(session, space_id)
    _require_rank(await _actor_role(session, space_id, actor), Role.admin)
    inv = await _own_pending(session, space_id, invitation_id)
    now = _now()
    if inv.resend_window_start is None or now - inv.resend_window_start >= RESEND_WINDOW:
        inv.resend_window_start = now
        inv.resend_count = 0
    if inv.resend_count >= MAX_RESENDS_PER_DAY:
        retry_after = max(1, int((inv.resend_window_start + RESEND_WINDOW - now).total_seconds()))
        await session.rollback()
        raise HTTPException(
            429,
            detail="Too many resends for this invitation. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    token = new_token()  # rotating the hash kills the previous token
    inv.token_hash = hash_token(token)
    inv.expires_at = now + INVITATION_TTL
    inv.resend_count += 1
    inviter = await _inviter_name(session, actor)
    try:
        await _send(
            sender,
            to=inv.email,
            space_name=space.name,
            inviter=inviter,
            link_base=link_base,
            token=token,
        )
    except HTTPException:
        await session.rollback()
        raise
    await session.commit()
    return _out(inv)


async def revoke_invitation(
    session: AsyncSession, *, space_id: UUID, actor: UUID, invitation_id: UUID
) -> None:
    await _lock_space(session, space_id)
    _require_rank(await _actor_role(session, space_id, actor), Role.admin)
    inv = await _own_pending(session, space_id, invitation_id)
    inv.status = InvitationStatus.revoked
    inv.responded_at = _now()
    await session.commit()


# --- invitee side ----------------------------------------------------------------------------


async def _load_for_invitee(
    session: AsyncSession, token: str, email: str, email_verified: bool
) -> Invitation:
    """Lock and return the matching pending invitation, or raise the generic 404.

    Every failure mode (unknown token, wrong status, expired, unverified or different email)
    is indistinguishable to the caller.
    """
    inv = (
        await session.execute(
            select(Invitation)
            .where(Invitation.token_hash == hash_token(token))
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if inv is None or inv.status != InvitationStatus.pending:
        await session.rollback()
        raise _generic_404()
    if inv.expires_at <= _now():
        inv.status = InvitationStatus.expired
        inv.responded_at = _now()
        await session.commit()
        raise _generic_404()
    if not email_verified or email.strip().lower() != inv.email:
        await session.rollback()
        raise _generic_404()
    return inv


async def preview(
    session: AsyncSession, token: str, email: str, email_verified: bool
) -> InvitationPreview:
    inv = await _load_for_invitee(session, token, email, email_verified)
    space = await session.get(Space, inv.space_id)
    name = await _inviter_name(session, inv.invited_by)
    await session.rollback()
    if space is None:
        raise _generic_404()
    return InvitationPreview(household_name=space.name, inviter_name=name)


async def accept(
    session: AsyncSession, token: str, user_id: UUID, email: str, email_verified: bool
) -> InvitationAccepted:
    # The row lock serialises concurrent accepts: the second sees `accepted` and gets the 404.
    inv = await _load_for_invitee(session, token, email, email_verified)
    space = await session.get(Space, inv.space_id)
    if space is None:
        await session.rollback()
        raise _generic_404()
    await session.execute(
        pg_insert(SpaceMembership)
        .values(id=uuid4(), space_id=inv.space_id, user_id=user_id, role=inv.role)
        .on_conflict_do_nothing(constraint="uq_space_memberships_space_user")
    )
    inv.status = InvitationStatus.accepted
    inv.responded_at = _now()
    # An existing member keeps their current role (the insert above did nothing).
    role = (
        await session.execute(
            select(SpaceMembership.role).where(
                SpaceMembership.space_id == inv.space_id, SpaceMembership.user_id == user_id
            )
        )
    ).scalar_one()
    result = InvitationAccepted(space_id=inv.space_id, household_name=space.name, role=Role(role))
    await session.commit()
    return result


async def decline(session: AsyncSession, token: str, email: str, email_verified: bool) -> None:
    inv = await _load_for_invitee(session, token, email, email_verified)
    inv.status = InvitationStatus.declined
    inv.responded_at = _now()
    await session.commit()
