# HEM-018: API, categories, contracts and schedule service

**Phase:** 3 · **Status:** In Review · **Owner:** Engineer · **Depends on:** HEM-012

## Goal
A space member can record contracts (insurance, utilities, subscriptions, memberships and other recurring obligations). They pick from seeded categories and see each contract's next payment, renewal date and notice deadline.

## Acceptance criteria
- [ ] **Migration (schema `app`):**
  - `categories`: `id`, `key` (for example `insurance.home`), `parent_key`, `kind` (`expense`|`income`), `space_id` nullable. NULL means a system category; a value means a space's custom category.
    - Seed the system categories from PROJECT_PLAN §2, plus sensible groups for expenses and income: insurance.*, utility.*, subscription.*, membership.*, housing, transport, food, health, kids, other; income salary, business, other.
    - Keys are unique per scope.
  - `contracts`:
    - `id`, `space_id` (FK, cascade on space delete), `category_id`, `name`, `provider`
    - `amount` `Numeric(18,4)`, `currency` char(3)
    - `frequency` (`weekly`|`monthly`|`quarterly`|`semiannual`|`annual`)
    - `start_date`, `end_date` nullable
    - `auto_renew` bool, `renewal_term_months` nullable, `notice_period_days` nullable
    - `member_user_id` nullable: "applies to"
    - `status` (`active`|`cancelled`)
    - `notes`
    - `created_by`, `created_at`, `updated_at` (timestamptz)
- [ ] **Categories routes:**
  - `GET /api/v1/spaces/{space_id}/categories`: system categories plus the space's own.
  - `POST` and `DELETE` for the space's custom categories. A system category cannot be deleted (409). A category in use cannot be deleted (409).
- [ ] **Contracts CRUD** under `/api/v1/spaces/{space_id}/contracts`:
  - Routes: `GET` (list), `POST`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`.
  - The list uses cursor pagination and filters on `category`, `status` and `member_user_id`.
  - Every response includes a computed `schedule` with `next_payment_date`, `renewal_date` and `notice_deadline`. Each is nullable.
- [ ] **`GET /api/v1/spaces/{space_id}/contracts/upcoming?days=30`** returns the events in the window, sorted by date. Event types are `payment`, `renewal` and `notice_deadline`, each with the contract id, name, amount and currency. `days` is 1 to 366. Phase 5 notifications will reuse this service.
- [ ] **Schedule service** (`modules/contracts/schedule.py`): pure functions with no DB access.
  - Month-end clamping: a contract starting Jan 31 pays Feb 28/29, then Mar 31.
  - Contracts after `end_date` without auto-renew, and cancelled contracts, have no next payment.
  - Renewal rolls forward by `renewal_term_months` (default 12) while `auto_renew` is true.
  - Notice deadline = renewal date minus `notice_period_days`.
  - All results are relative to an `as_of` date passed in, never `date.today()` inside the function.
- [ ] **Validation:**
  - Currency must be a known ISO-4217 code. Reuse the existing `Currency` type from profile.
  - Amount must be > 0, with at most the currency's minor units in decimal places (JPY 0, EUR 2, and so on).
  - `end_date` >= `start_date`.
  - `category_id` must be a system category or one of this space's categories. A foreign space's category returns 422 (no existence leak).
  - `member_user_id` must be a member of the space (422).
- [ ] **Authorization:**
  - Every route depends on `require_space_member()`. Any member, any role, reads and writes (HEM-014 decision 3).
  - A non-member gets 404 on every route.
  - A contract id from another space returns 404.
- [ ] **Money:** money is `Decimal` end to end. JSON serialises amounts as strings, never floats. Use one shared `Money` schema in `core/` that HEM-019 reuses.
- [ ] **Tests:**
  - A schedule-service unit test table: frequencies, month ends, leap years, end dates, auto-renew rollover, notice deadlines.
  - Space isolation: a stranger gets 404 on every route.
  - Cross-space ids (category, contract, member) are rejected.
  - Validation errors are problem+json.
  - Pagination.
- [ ] Regenerate the TS client with `npm run gen:api`.

## Design notes
- Module `modules/contracts/` (models, schemas, service, router, schedule) and `modules/categories/`. The router stays thin.
- Dates on contracts are calendar dates (`date`), not datetimes.
- Keep the schedule service free of FX. Conversion is HEM-020's job.

## Handoff log

## Review
