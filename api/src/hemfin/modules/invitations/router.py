from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.config import Settings, get_settings
from hemfin.core.db import get_session
from hemfin.core.deps import (
    SpaceAccess,
    get_current_user,
    get_token_claims,
    require_space_member,
)
from hemfin.core.email import EmailSender, get_email_sender
from hemfin.core.errors import PROBLEM_JSON
from hemfin.core.pagination import DEFAULT_LIMIT, CursorParam, LimitParam, Page
from hemfin.core.security import TokenClaims
from hemfin.modules.invitations import service
from hemfin.modules.invitations.schemas import (
    InvitationAccepted,
    InvitationCreate,
    InvitationOut,
    InvitationPreview,
    TokenBody,
)
from hemfin.modules.spaces.models import Role
from hemfin.modules.users.service import CurrentUser

# Admin routes live under a space; token routes are for the logged-in invitee. The token is
# only ever read from the request body.
space_router = APIRouter(prefix="/spaces/{space_id}/invitations", tags=["invitations"])
token_router = APIRouter(prefix="/invitations", tags=["invitations"])

_PROBLEM: dict[str, Any] = {"content": {PROBLEM_JSON: {}}}
_401: dict[int | str, dict[str, Any]] = {401: {"description": "Not authenticated", **_PROBLEM}}
_403: dict[int | str, dict[str, Any]] = {403: {"description": "Insufficient role", **_PROBLEM}}
_404: dict[int | str, dict[str, Any]] = {
    404: {"description": "Unknown space, not a member, or unknown invitation", **_PROBLEM}
}
_409: dict[int | str, dict[str, Any]] = {
    409: {
        "description": "Rule conflict; `code` may be already_invited or already_member",
        **_PROBLEM,
    }
}
_503: dict[int | str, dict[str, Any]] = {
    503: {"description": "Email sending unavailable or not configured", **_PROBLEM}
}
_429: dict[int | str, dict[str, Any]] = {
    429: {
        "description": "Resend cooldown (60 s) or daily cap (3) reached",
        "headers": {
            "Retry-After": {
                "description": "Seconds until another resend is allowed",
                "schema": {"type": "integer"},
            }
        },
        **_PROBLEM,
    }
}
_GENERIC_404: dict[int | str, dict[str, Any]] = {
    404: {
        "description": "Invitation not found (also: expired, revoked, used, or not for you)",
        **_PROBLEM,
    }
}

Session = Annotated[AsyncSession, Depends(get_session)]
Admin = Annotated[SpaceAccess, Depends(require_space_member(Role.admin))]
Sender = Annotated[EmailSender, Depends(get_email_sender)]
Cfg = Annotated[Settings, Depends(get_settings)]


@space_router.post(
    "",
    status_code=201,
    summary="Invite someone to a household by email (admin or owner)",
    responses={**_401, **_403, **_404, **_409, **_503},
)
async def create_invitation(
    body: InvitationCreate, access: Admin, session: Session, sender: Sender, cfg: Cfg
) -> InvitationOut:
    return await service.create_invitation(
        session,
        sender,
        space_id=access.space_id,
        actor=access.user_id,
        email=body.email,
        role=Role(body.role),
        link_base=cfg.WEB_BASE_URL,
    )


@space_router.get(
    "",
    summary="List a household's invitations (admin or owner)",
    responses={**_401, **_403, **_404},
)
async def list_invitations(
    access: Admin,
    session: Session,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
) -> Page[InvitationOut]:
    items, nxt = await service.list_invitations_page(session, access.space_id, limit, cursor)
    return Page[InvitationOut](items=items, next_cursor=nxt)


@space_router.post(
    "/{invitation_id}/resend",
    summary="Rotate the token, reset the expiry and resend (1 per 60 s, max 3 per day)",
    responses={**_401, **_403, **_404, **_409, **_429, **_503},
)
async def resend_invitation(
    invitation_id: UUID, access: Admin, session: Session, sender: Sender, cfg: Cfg
) -> InvitationOut:
    return await service.resend_invitation(
        session,
        sender,
        space_id=access.space_id,
        actor=access.user_id,
        invitation_id=invitation_id,
        link_base=cfg.WEB_BASE_URL,
    )


@space_router.delete(
    "/{invitation_id}",
    status_code=204,
    summary="Revoke a pending invitation (admin or owner)",
    responses={**_401, **_403, **_404, **_409},
)
async def revoke_invitation(invitation_id: UUID, access: Admin, session: Session) -> Response:
    await service.revoke_invitation(
        session, space_id=access.space_id, actor=access.user_id, invitation_id=invitation_id
    )
    return Response(status_code=204)


@token_router.post(
    "/preview",
    summary="Preview an invitation (household and inviter name only)",
    responses={**_401, **_GENERIC_404},
)
async def preview_invitation(
    body: TokenBody,
    claims: Annotated[TokenClaims, Depends(get_token_claims)],
    _user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Session,
) -> InvitationPreview:
    return await service.preview(
        session, body.token.get_secret_value(), claims.email, claims.email_verified
    )


@token_router.post(
    "/accept",
    summary="Accept an invitation (verified email must match)",
    responses={**_401, **_GENERIC_404},
)
async def accept_invitation(
    body: TokenBody,
    claims: Annotated[TokenClaims, Depends(get_token_claims)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Session,
) -> InvitationAccepted:
    return await service.accept(
        session, body.token.get_secret_value(), user.id, claims.email, claims.email_verified
    )


@token_router.post(
    "/decline",
    status_code=204,
    summary="Decline an invitation",
    responses={**_401, **_GENERIC_404},
)
async def decline_invitation(
    body: TokenBody,
    claims: Annotated[TokenClaims, Depends(get_token_claims)],
    _user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Session,
) -> Response:
    await service.decline(
        session, body.token.get_secret_value(), claims.email, claims.email_verified
    )
    return Response(status_code=204)
