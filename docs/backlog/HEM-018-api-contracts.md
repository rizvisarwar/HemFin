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

### 2026-11-27 Engineer
PR: https://github.com/rizvisarwar/HemFin/pull/27 (branch `hem-018-api-contracts`).

**PM scope additions (HEM-017 design, finance.md section 11), done in this PR**
1. Categories have a display `name` column and response field. System rows are seeded with English names (insurance.home = "Home insurance"). Custom categories take `name` (trimmed, 1..60) on POST; `key` is optional and derived from the name (`Pet care & vets` -> `pet_care_vets`).
2. Upcoming events: `date`, `type`, `contract_id`, `contract_name`, `amount`.
3. Shared Money response shape `{"amount": "<decimal string>", "currency": "XXX"}` (`MoneyBase` in `core/money.py`). Event `amount` uses it nested. Contract responses and requests keep `amount` and `currency` flat, as the ticket specifies (they inherit `Money`/`MoneyBase`).

**What was done**
- `core/money.py`: `Currency` (moved from profile, re-exported there), `minor_units`, `validate_amount`, `MoneyBase`, `Money`.
- Migration 0006 (down 0005): `categories` (stable uuid5 seed ids, partial unique indexes per scope), `contracts` (checks, FKs).
- `modules/categories`, `modules/contracts` (models, schemas, service, router, `schedule.py`). Schedule is pure and takes `as_of`; the router gets today from a `get_today` dependency (tests pin it).
- Client regenerated with `npm run gen:api`.

**How to verify**: see the PR body. API: `uv run pytest` with `DATABASE_URL` set (281 passed locally against postgres:16, including the migration roundtrip).

**Decisions**
- Category `GET` returns `Page` with all items and `next_cursor: null` (bounded list: seed plus at most 100 custom per space).
- `category` list filter takes a key; a group key (`insurance`) includes its children.
- Renewals exist only with `auto_renew`. First renewal = `end_date` if set, else start + term (default 12 months); then rolls by term. With auto-renew, payments continue past `end_date`.
- `notice_deadline` in `schedule` is for the next renewal and may be in the past; `upcoming` only lists deadlines inside the window.
- `upcoming` returns `{as_of, until, items}` and includes only active contracts; a weekly contract yields several payment events.
- Deleting a custom category that is a parent of another custom category is 409 `category_in_use`.
- Validation errors from the service carry stable `code`s (invalid_category, invalid_member, invalid_amount, invalid_dates).

**Limitations and follow-ups**
- If a member leaves a space, `member_user_id` on contracts is not cleared (follow-up).
- HEM-020 also adds a migration; PM to order revisions at merge.
- Minor-units table is hand-maintained (ISO-4217 exceptions); revisit if exotic currencies matter.

### 2026-11-27 Engineer, review round 1 fixes
1. Minor-unit bypass: `validate_amount` now strips trailing zeros from the digit tuple (no `normalize()`, no rounding). Both bypass strings are in `test_money.py::test_invalid`; POST and PATCH paths are covered in `test_contracts_db.py`.
2. Cross-space member: new test with Bob as a real member of space B only; POST and PATCH on space A both give 422 `invalid_member` (control: accepted in his own space). Also PATCH with a real foreign category id gives 422 `invalid_category` (nit 12).
3. `GET /contracts/upcoming` is a PM-approved bounded exception to cursor pagination: `days` 1..366 plus new `limit` (default 50, 1..200). The response has `has_more`; events are cut off after sorting. Documented in the route description. Test added.
4. Amounts are string-only on input: JSON numbers get 422, and the OpenAPI/TS input type is now `string` (client regenerated).
5. Categories stay unpaginated (accepted, bounded).
6. Accepted: no renewal or notice event without auto_renew. Phase 5 follow-up: add an "ends" event for contracts with an end_date.
7. Contracts require an expense-kind category; an income category gives 422 `invalid_category` (test added).
8. `update_contract` converts `frequency` and `status` explicitly with `.value`.
9. One sort, `(date, type value, contract name, id)`, in both paths (`schedule.upcoming_events` sorts by `(date, type value)`; notice_deadline < payment < renewal).
10. `_visible` returns `ColumnElement[bool]`, `to_out` uses `CategoryKind(...)`, and the production assert is an explicit 422 guard.
11. Seed left as is (migrations run once).
12. Added tests: leap-day annual auto-renew, the `c_` prefix derivation, a derived slug colliding with a system key (409). While doing this I changed renewal rolling to anchor on the end date (or the start date), so a Feb 29 start renews Feb 28 2025 and then Feb 29 2028 instead of drifting to the 28th for good.
13. Phase 5 follow-up: `get_today` is the UTC date; notifications need user-local day boundaries.
14. Phase 5 follow-up (tracked): clear `contracts.member_user_id` when a member leaves a space.

## Review

### Round 1: CHANGES_REQUESTED (PR comment 7215389574)
Blocking items 1 to 3 and nits 4 to 14, as sent by the PM. See the Handoff log entry dated 2026-11-27 (round 1 fixes) for how each was addressed.
