# HEM-013: API, invitations

**Phase:** 2 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-012 · **PM security review required**

## Goal
Admins invite people to a household by email. The invitee accepts only with the matching verified email. Tokens are never stored in plain text.

## Acceptance criteria
- [ ] `invitations` table (schema `app`, Alembic migration): `id`, `space_id`, `email` (stored lower-cased), `role` (`admin` or `member`), `token_hash` (unique, SHA-256 of a 32-byte url-safe random token), `status` (`pending|accepted|declined|revoked|expired`), `invited_by`, `expires_at` (7 days, UTC), `created_at`, `responded_at`. A partial unique index allows one `pending` invitation per space and email.
- [ ] `POST /api/v1/spaces/{space_id}/invitations` (admin or owner; household only, 409 on a personal space; cannot invite as `owner`; 409 if the email is already a member). Sends an email through Resend. The raw token appears only in the email link and is never returned by the API, never logged, and never stored.
- [ ] `GET /api/v1/spaces/{space_id}/invitations` (admin or owner) lists invitations with status; no tokens or hashes.
- [ ] `POST /api/v1/spaces/{space_id}/invitations/{id}/resend` rotates the token, resets the 7-day expiry, resends. `DELETE .../{id}` revokes. Both admin or owner. Resend is rate limited (max 3 per invitation per day).
- [ ] Token-based endpoints, for the logged-in invitee: `POST /api/v1/invitations/preview` and `POST /api/v1/invitations/accept` and `POST /api/v1/invitations/decline`, with the token in the **request body**, never in a URL path or query string. `preview` returns household name and inviter display name only.
- [ ] Accept requires the caller's verified account email to equal the invitation email (case-insensitive). A mismatch, an expired, revoked, used or unknown token all return the same generic 404 problem, so tokens and emails cannot be probed. Accept is atomic: it creates the membership and marks the invitation `accepted` in one transaction, and a double accept cannot create two memberships.
- [ ] Expired pending invitations are marked `expired` lazily on read and by `POST /internal/jobs/daily` (existing job secret auth).
- [ ] Email sending sits behind an `EmailSender` interface. Resend implementation reads `RESEND_API_KEY` (`SecretStr`, optional) and `EMAIL_FROM` from `Settings`; with no key configured, the app starts and invitation creation returns a clear 503 problem. A fake sender is used in tests. Both variables go in `api/.env.example` with placeholders and a comment, and in `render.yaml` as `sync: false`. No secret values anywhere.
- [ ] Tests: new user and existing user accept; email mismatch rejected; expiry; revoke; resend rotates the token (old one dead); double accept; non-admin gets 403 and non-member 404; the token never appears in logs, responses or the OpenAPI spec examples. Regenerate the TS client.

## Design notes
- The token goes in the email link as a URL **fragment** (`/invite#token=...`) so it never reaches server logs, referrers or span URLs. The web accept page reads it client-side and POSTs it. This resolves the HEM-005 review follow-up.
- Verified email: use the email claim from the Supabase JWT and require `email_verified`/confirmed. If the existing `get_current_user` does not expose it, extend it.
- Email content: plain, short, household name and inviter name only; no finance data.

## Carry-over from the HEM-012 review (PR #20, approved; fix these in this PR first)
- `transfer_ownership` 409 hard-codes "10" and reveals the target's household count; use `MAX_OWNED_HOUSEHOLDS` and a neutral message.
- `MemberRoleChange.role` should be `Literal[Role.admin, Role.member]` so `owner` is not in the OpenAPI/TS types; regenerate the client.
- `_space_out(space: Any, ...)` should take `space: Space`; `change_member_role` returns a value the router discards.
- `counts` subquery in `list_spaces_page` should be limited to the caller's spaces.
- Tests: `test_concurrent_demote_and_remove_keep_owner` must target the owner and assert status codes; make the `count(204) >= 1` assertion exact; add member-removes-member (403); give the 14-request concurrency test pool headroom.
- Future finance tables must use `ON DELETE CASCADE` on `space_id`, and the household delete test should cover them (Phase 3).

## Handoff log

## Review
