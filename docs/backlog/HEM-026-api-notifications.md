# HEM-026: API, in-app notifications and daily generator

**Phase:** 5 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-018 (schedule service), HEM-024 (SEK only)

## Goal
Every day the job creates in-app notifications for upcoming contract events, once per event and member. Members can list them, see an unread count, mark them read and dismiss them. In-app only: no email, no digest, no preferences (user decision 2026-11-27).

## Acceptance criteria
- [ ] **Migration (schema `app`): `notifications`:**
  - Columns:
    - `id`, `space_id` (FK, cascade on space delete), `user_id` (FK users, cascade)
    - `contract_id` (FK, cascade on contract delete)
    - `type` (`payment_due`|`renewal`|`notice_deadline`|`contract_end`)
    - `event_date` (date), `title`, `amount` (Numeric(18,4), nullable), `currency` (default 'SEK', nullable)
    - `read_at` and `dismissed_at` (timestamptz, nullable), `created_at`
  - Unique `(user_id, contract_id, type, event_date)`: this is the idempotency key.
- [ ] **Generator** `modules/notifications/service.generate(session, today)`, called from `POST /internal/jobs/daily` next to the invitation expiry:
  - Uses the HEM-018 schedule service (pure functions) for every active contract.
  - Windows: `payment_due` and `renewal` 7 days ahead; `notice_deadline` and `contract_end` 30 days ahead.
  - `contract_end` is new: a contract with an `end_date` and no auto-renew (the Phase 5 follow-up from HEM-018).
  - Creates one row per current member of the space. `INSERT ... ON CONFLICT DO NOTHING`, so a re-run is a no-op.
  - "Today" is the date in `Europe/Stockholm`, not UTC (Phase 5 follow-up). The job response adds `notifications_created`.
  - No data from one space ever goes to a non-member.
- [ ] **Routes** under `/api/v1/spaces/{space_id}/notifications`, all with `require_space_member()`. Every route returns only the caller's own rows (`user_id` = caller) in that space; a non-member gets 404.
  - `GET` lists non-dismissed rows, newest `created_at` first, with cursor pagination.
  - Each item has: `id`, `space_id`, `contract_id`, `type`, `title`, `event_date`, `amount` (Money `{amount, currency}` or null), `read_at` (or null) and `created_at`. The page envelope is `{items, next_cursor}`.
  - `GET /unread-count` returns `{count}`.
  - `POST /{id}/read`, `POST /read-all`, `POST /{id}/dismiss`. Each is idempotent and returns 204. Another user's row id returns 404.
- [ ] **Member removal** (Phase 5 follow-up): when a member leaves or is removed, delete their notifications for that space, and clear `member_user_id` on that space's contracts, expenses and income sources and entries. Same transaction as the removal.
- [ ] **Tests:**
  - Generator windows per type, including boundaries.
  - Idempotent re-run.
  - Stockholm date around midnight UTC.
  - Cancelled or ended contracts produce nothing.
  - Every member gets a row; a non-member gets none.
  - Routes: isolation (a stranger gets 404, another member's rows are invisible, another user's id returns 404), unread count, read-all, dismiss.
  - Member removal cleanup.
  - The job response.
- [ ] Regenerate the TS client.

## Design notes
- Module `modules/notifications/` (models, schemas, service, router).
- Title text is generated server-side in English and stays stable, with no date (for example "Home insurance renews"), per the HEM-025 spec. `event_date` and `amount` are separate fields, which the web formats in sv-SE.
- Unread count excludes dismissed rows. The default page size is 20.
- Retention: none for now (POC).

## Handoff log

## Review
