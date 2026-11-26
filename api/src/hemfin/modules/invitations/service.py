"""Invitations. The raw token exists only in memory and in the email link, never in the DB,
logs, responses or a URL path/query. Only its SHA-256 is stored."""

import hashlib
import hmac
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import func, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.email import EmailDeliveryError, EmailSender, UnconfiguredEmailSender
from hemfin.core.errors import CodedHTTPException
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

INVITATION_TTL = timedelta(days=7)
MAX_RESENDS_PER_DAY = 3
RESEND_WINDOW = timedelta(days=1)
RESEND_COOLDOWN = timedelta(seconds=60)


def resend_retry_after(
    *,
    resend_count: int,
    window_start: datetime | None,
    last_sent_at: datetime | None,
    now: datetime,
) -> int | None:
    """Seconds to wait before another resend, or None if a resend is allowed now.

    Two limits: a per-invitation cooldown (1 per 60 s, counted from the last email) and a
    daily cap (MAX_RESENDS_PER_DAY per rolling window). The longer wait wins.
    """
    waits: list[float] = []
    if last_sent_at is not None:
        waits.append((last_sent_at + RESEND_COOLDOWN - now).total_seconds())
    window_open = window_start is not None and now - window_start < RESEND_WINDOW
    if window_open and resend_count >= MAX_RESENDS_PER_DAY:
        assert window_start is not None
        waits.append((window_start + RESEND_WINDOW - now).total_seconds())
    wait = max(waits, default=0.0)
    return max(1, int(wait + 0.999)) if wait > 0 else None


log = logging.getLogger("hemfin.invitations")


def _generic_404() -> HTTPException:
    """The single answer for every invalid, expired, revoked, used or mismatched token."""
    return HTTPException(404, detail="Invitation not found.")


def _already_invited() -> CodedHTTPException:
    return CodedHTTPException(
        409, "already_invited", "An invitation is already pending for that email."
    )


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
    sender: EmailSender,
    *,
    to: str,
    space_name: str,
    inviter: str | None,
    link_base: str,
    token: str,
) -> None:
    who = inviter or "A HemFin member"
    body = (
        f'{who} invited you to join the household "{space_name}" on HemFin.\n\n'
        f"Open this link while signed in with this email address to respond:\n"
        f"{link_base.rstrip('/')}/invite#token={token}\n\n"
        "The invitation expires in 7 days. If you did not expect it, ignore this email."
    )
    await sender.send(to=to, subject=f"Invitation to join {space_name}", text=body)


def _require_configured(sender: EmailSender) -> None:
    """Fail before anything is stored when email is not set up at all."""
    if isinstance(sender, UnconfiguredEmailSender):
        raise HTTPException(503, detail="Email sending is not configured.")


def _not_sent() -> CodedHTTPException:
    return CodedHTTPException(
        503,
        "email_not_sent",
        "The invitation was saved but the email could not be sent. Use resend to try again.",
    )


async def _deliver(
    session: AsyncSession,
    sender: EmailSender,
    *,
    invitation_id: UUID,
    undo_resend_count: bool,
    to: str,
    space_name: str,
    inviter: str | None,
    link_base: str,
    token: str,
) -> None:
    """Send after the transaction (and its row locks) are released.

    On failure the invitation stays as saved, the cooldown is cleared so the admin can
    resend straight away, and the caller gets the same 503 for create and resend.
    """
    try:
        await _send(
            sender,
            to=to,
            space_name=space_name,
            inviter=inviter,
            link_base=link_base,
            token=token,
        )
    except EmailDeliveryError:
        values: dict[str, Any] = {"last_sent_at": None}
        if undo_resend_count:
            values["resend_count"] = func.greatest(Invitation.resend_count - 1, 0)
        try:
            # Only touch the row if it still carries the token whose email failed; a newer
            # resend in between must keep its own cooldown and count.
            await session.execute(
                update(Invitation)
                .where(Invitation.id == invitation_id, Invitation.token_hash == hash_token(token))
                .values(**values)
            )
            await session.commit()
        except Exception:
            await session.rollback()
            log.warning("could not undo the cooldown after a failed invitation email")
        raise _not_sent() from None


async def _inviter_name(session: AsyncSession, user_id: UUID) -> str | None:
    user = await session.get(User, user_id)
    return user.display_name if user and user.display_name else None


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
    _require_configured(sender)
    space = await _lock_space(session, space_id)
    _require_rank(await _actor_role(session, space_id, actor), Role.admin)
    _require_household(space, "invited to")
    space_name = space.name
    already_member = (
        await session.execute(
            select(SpaceMembership.id)
            .join(User, User.id == SpaceMembership.user_id)
            .where(SpaceMembership.space_id == space_id, func.lower(User.email) == email)
        )
    ).first()
    if already_member is not None:
        raise CodedHTTPException(
            409, "already_member", "That person is already a member of this household."
        )
    await expire_due(session, space_id)
    if await _other_pending(session, space_id, email, None):
        await session.rollback()
        raise _already_invited()
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
        last_sent_at=_now(),
    )
    session.add(inv)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise _already_invited() from None
    inviter = await _inviter_name(session, actor)
    await session.commit()  # releases the space lock before any network call
    await session.refresh(inv)
    out = _out(inv)
    await _deliver(
        session,
        sender,
        invitation_id=inv.id,
        undo_resend_count=False,
        to=email,
        space_name=space_name,
        inviter=inviter,
        link_base=link_base,
        token=token,
    )
    return out


async def _other_pending(
    session: AsyncSession, space_id: UUID, email: str, except_id: UUID | None
) -> bool:
    stmt = select(Invitation.id).where(
        Invitation.space_id == space_id,
        Invitation.email == email,
        Invitation.status == InvitationStatus.pending,
    )
    if except_id is not None:
        stmt = stmt.where(Invitation.id != except_id)
    return (await session.execute(stmt)).first() is not None


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


async def _own_actionable(session: AsyncSession, space_id: UUID, invitation_id: UUID) -> Invitation:
    """Lock an invitation of this space that an admin may still resend or revoke.

    Pending and expired rows qualify. A row still marked pending past its expiry is treated
    as pending: resend rotates it and revoke revokes it, as for an expired row.
    Accepted, declined and revoked rows are final: 409.
    """
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
    if inv.status not in (InvitationStatus.pending, InvitationStatus.expired):
        await session.rollback()
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
    _require_configured(sender)
    space = await _lock_space(session, space_id)
    _require_rank(await _actor_role(session, space_id, actor), Role.admin)
    space_name = space.name
    inv = await _own_actionable(session, space_id, invitation_id)
    now = _now()
    retry_after = resend_retry_after(
        resend_count=inv.resend_count,
        window_start=inv.resend_window_start,
        last_sent_at=inv.last_sent_at,
        now=now,
    )
    if retry_after is not None:
        await session.rollback()
        raise CodedHTTPException(
            429,
            "resend_limited",
            "Too many resends for this invitation. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    if inv.status == InvitationStatus.expired:
        # Reviving it must not collide with a newer pending invitation for the same email.
        if await _other_pending(session, space_id, inv.email, inv.id):
            await session.rollback()
            raise _already_invited()
        inv.status = InvitationStatus.pending
        inv.responded_at = None
    if inv.resend_window_start is None or now - inv.resend_window_start >= RESEND_WINDOW:
        inv.resend_window_start = now
        inv.resend_count = 0
    token = new_token()  # rotating the hash kills the previous token
    inv.token_hash = hash_token(token)
    inv.expires_at = now + INVITATION_TTL
    inv.resend_count += 1
    inv.last_sent_at = now
    to = inv.email
    inviter = await _inviter_name(session, actor)
    try:
        await session.commit()  # releases the locks before any network call
    except IntegrityError:
        await session.rollback()
        raise _already_invited() from None
    out = _out(inv)
    await _deliver(
        session,
        sender,
        invitation_id=inv.id,
        undo_resend_count=True,
        to=to,
        space_name=space_name,
        inviter=inviter,
        link_base=link_base,
        token=token,
    )
    return out


async def revoke_invitation(
    session: AsyncSession, *, space_id: UUID, actor: UUID, invitation_id: UUID
) -> None:
    await _lock_space(session, space_id)
    _require_rank(await _actor_role(session, space_id, actor), Role.admin)
    inv = await _own_actionable(session, space_id, invitation_id)
    inv.status = InvitationStatus.revoked
    inv.responded_at = _now()
    await session.commit()


# --- invitee side ----------------------------------------------------------------------------


async def _load_for_invitee(
    session: AsyncSession, token: str, email: str, email_verified: bool, *, lock: bool = True
) -> Invitation:
    """Return the matching pending invitation (row-locked unless `lock` is False, for
    read-only callers), or raise the generic 404.

    Every failure mode (unknown token, wrong status, expired, unverified or different email)
    is indistinguishable to the caller.
    """
    stmt = select(Invitation).where(Invitation.token_hash == hash_token(token))
    if lock:
        stmt = stmt.with_for_update()
    inv = (
        await session.execute(stmt.execution_options(populate_existing=True))
    ).scalar_one_or_none()
    if inv is None or inv.status != InvitationStatus.pending:
        await session.rollback()
        raise _generic_404()
    if inv.expires_at <= _now():
        inv.status = InvitationStatus.expired
        inv.responded_at = _now()
        await session.commit()
        raise _generic_404()
    if not email_verified or not hmac.compare_digest(
        email.strip().lower().encode(), inv.email.encode()
    ):
        await session.rollback()
        raise _generic_404()
    return inv


async def preview(
    session: AsyncSession, token: str, email: str, email_verified: bool
) -> InvitationPreview:
    inv = await _load_for_invitee(session, token, email, email_verified, lock=False)
    space = await session.get(Space, inv.space_id)
    name = await _inviter_name(session, inv.invited_by)
    # Read everything before rolling back: rollback expires loaded ORM objects, and touching
    # an expired attribute afterwards triggers a lazy load, which fails under asyncio
    # (MissingGreenlet).
    household_name = space.name if space is not None else None
    await session.rollback()
    if household_name is None:
        raise _generic_404()
    return InvitationPreview(household_name=household_name, inviter_name=name)


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
