# HEM-012: API, households and members

**Phase:** 2 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-008

## Goal
A user can create household spaces, list the spaces they belong to, rename a household, manage member roles, remove members or leave, and delete a household. All of it goes through the Spaces privacy model.

## Acceptance criteria
- [ ] `POST /api/v1/spaces` creates a `household` space; the caller becomes `owner`. Name is trimmed, 1 to 80 chars. At most 10 households owned per user (409).
- [ ] `GET /api/v1/spaces` lists the caller's spaces (personal and household) with `role` and `member_count`. Cursor pagination, as everywhere else.
- [ ] `PATCH /api/v1/spaces/{space_id}` renames a household (admin or owner). A personal space cannot be renamed or deleted (409).
- [ ] `DELETE /api/v1/spaces/{space_id}` deletes a household (owner only). Cascade rules are tested.
- [ ] `GET /api/v1/spaces/{space_id}/members` lists members (user id, display name, email, role, joined_at). Any member can read it. Email is shown to members of the same household only.
- [ ] `PATCH /api/v1/spaces/{space_id}/members/{user_id}` changes a role (owner only). Roles are `admin` or `member`; there is exactly one `owner`, changed only through `POST .../transfer-ownership` (owner only, target must be a member).
- [ ] `DELETE /api/v1/spaces/{space_id}/members/{user_id}`: owner or admin removes a member (admin cannot remove an admin or the owner). A member can remove themself (leave). The owner cannot leave without transferring ownership first (409).
- [ ] Every route depends on `require_space_member(...)` with the right minimum role. A non-member gets **404**, not 403. A member with too low a role gets 403.
- [ ] Role changes and removals take a row lock so two concurrent calls cannot leave a household with no owner.
- [ ] Tests: space isolation (stranger gets 404 on every route), role matrix, last-owner rules, concurrency of the owner guard. Then regenerate the TS client with `npm run gen:api`.

## Design notes
- Alembic migration only if the schema needs it (member display data comes from `users`/`profiles`; a `joined_at` is `space_memberships.created_at`).
- Business rules in `modules/spaces/service.py`; the router stays thin. No logging of emails.
- `GET /spaces/{id}` already exists (HEM-008); keep its shape, add `member_count` only if backward compatible.

## Handoff log

### 2026-11-26 Engineer (Sonnet)
**Done:** all endpoints in the acceptance criteria (`POST/GET /spaces`, `PATCH/DELETE /spaces/{id}`, `GET /members`, `PATCH/DELETE /members/{user_id}`, `POST /transfer-ownership`). Rules live in `modules/spaces/service.py`; routes use `require_space_member(min_role)`. Every mutation row-locks the `spaces` row (`FOR UPDATE`) and re-reads the caller's role under the lock, so concurrent transfers/leaves cannot orphan or double-own a household. The household cap (10 owned) locks the creator's user row; transfer also checks the target's cap. New migration `0004` adds a partial unique index (one owner per space) as a DB backstop. Added shared keyset cursor helper `core/pagination.py` (opaque base64 cursor over created_at, id; `limit` 1..100, default 50), used for spaces and members lists. `GET /spaces/{id}` is unchanged. TS client regenerated.
**Tests:** `api/tests/test_households_db.py` (stranger 404 on every route, role matrix, leave/last-owner, cascade delete, cap, cursor paging, concurrency). These are `db`-marked and were NOT run locally (no Postgres available in my environment); CI must run them. Please look at CI results for that file first.
**Verify:** `cd api && uv run pytest` (with `DATABASE_URL` set to a migrated Postgres), `npm run check:api-drift`.
**Decisions / limitations:** role change and member removal return 204 (no body); `PATCH /spaces/{id}` returns the updated space. Role `owner` in the role PATCH is 422. Ownership transfer demotes the former owner to admin. The list sorts by creation time (not personal first).
**Follow-ups:** Web UI for household management; invitations (separate ticket).

## Review
