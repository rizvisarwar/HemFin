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

## Review
