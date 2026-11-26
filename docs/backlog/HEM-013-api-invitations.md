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
- [ ] (Added by PM after the HEM-014 design review) Creating an invitation returns distinct 409 problem messages for "that person is already a member" and "an invitation is already pending for that email" (the caller is an admin of the household, so this is acceptable).
- [ ] (Added by PM after the HEM-014 design review) Resend over the limit (3 per invitation per day) returns 429 problem+json with a `Retry-After` header, declared in the route responses, and both cases are covered by tests.
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

### 2026-11-26, Engineer (Sonnet 5.5)
Branch `hem-013-api-invitations`. PR: see the PR for this branch (URL in the PM report).

**Carry-over (first commit):** neutral transfer-cap message (no household count); `MemberRoleChange.role` is `Literal[Role.admin, Role.member]`; `_space_out` takes `Space`; `change_member_role` returns `None`; `list_spaces_page` counts only the caller's spaces; tests: owner-targeted concurrency test with exact status codes, exact leave/transfer assertion, member-removes-member 403, 14-request test given pool headroom (`pool_size=20`). The Phase 3 `ON DELETE CASCADE` note is left for Phase 3 tickets.

**Built:**
- Migration `0005` and `modules/invitations` (model, schemas, service, router). Only `sha256(token)` is stored. Link is `{WEB_BASE_URL}/invite#token=...` (fragment). Preview, accept and decline take `{"token": ...}` in the body (`SecretStr`, so it is masked in reprs); all invalid, expired, revoked, used, unverified or wrong-email cases return the same generic 404 problem.
- `TokenClaims.email_verified` (from `email_verified` or `user_metadata.email_verified` in the Supabase JWT); accept/preview/decline require it and compare the JWT email, case-insensitively.
- `core/email.py`: `EmailSender` interface, `ResendEmailSender` (httpx), unconfigured sender gives 503. Settings: `RESEND_API_KEY` (SecretStr, optional), `EMAIL_FROM`, `WEB_BASE_URL`, `JOB_SECRET` (SecretStr, optional). `.env.example` has placeholders, `render.yaml` has `sync: false`.
- Email is sent before commit, so a delivery failure (503) stores nothing and a failed resend keeps the old token.
- Accept locks the invitation row (`FOR UPDATE`), inserts the membership `ON CONFLICT DO NOTHING` and marks it accepted in one transaction.
- Added after the HEM-014 review: distinct 409 messages (already a member / invitation already pending); resend over 3 per day gives 429 problem+json with `Retry-After` (declared in the route responses and asserted in the OpenAPI test).
- `POST /internal/jobs/daily` did NOT exist (the ticket assumed it did), so I added it with `X-Job-Secret` checked by constant-time comparison against `JOB_SECRET` (503 if unset, 401 if wrong). It only expires invitations, is idempotent, and is hidden from OpenAPI. `docs/deploy.md` updated.
- Client regenerated (`npm run gen:api`).

**Verify:** `cd api && uv run ruff check . && uv run ruff format --check . && uv run mypy src && uv run pytest`, then `npm run gen:api && npm run check:api-drift`.

**Limitations and follow-ups:**
- **The DB tests (`tests/test_invitations_db.py`, and the updated `test_households_db.py`) could not run locally (no Postgres/uv here); they run only in CI.** Locally 85 passed, 61 skipped. Please watch the first CI run.
- The `uv` toolchain was missing, so checks were run from a pip-installed venv with the same dependency specs.
- Resend allows only pending invitations; an expired invitation is replaced by creating a new one.
- Web accept page (`/invite`, reads the fragment, POSTs the token) belongs to a later web ticket. Consider `Referrer-Policy: no-referrer` and `history.replaceState` to strip the fragment there.
- Add `/internal/jobs/weekly` when a ticket needs it; the cron workflow's header comment still says the endpoints are missing.

## Review
