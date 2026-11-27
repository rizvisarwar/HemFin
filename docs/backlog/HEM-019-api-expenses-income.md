# HEM-019: API, expenses and income

**Phase:** 3 · **Status:** In Review · **Owner:** Engineer · **Depends on:** HEM-018 (categories, shared `Money` schema), HEM-020 (FX service for `base_amount`)

## Goal
A space member can record one-off expenses and their income (recurring income sources and received income entries).

## Acceptance criteria
- [ ] **Migration (schema `app`):**
  - `expenses`:
    - `id`, `space_id` (cascade), `category_id`
    - `amount` `Numeric(18,4)`, `currency`
    - `spent_on` (date), `description`, `merchant` nullable
    - `contract_id` nullable: same space, `SET NULL` on contract delete
    - `member_user_id` nullable
    - `created_by`, `created_at`, `updated_at`
  - `income_sources`:
    - `id`, `space_id`, `name`
    - `type` (`salary`|`business`|`other`)
    - `amount`, `currency`, `frequency` (same enum as contracts, plus `irregular`)
    - `member_user_id` nullable, `active` bool, timestamps
  - `income_entries`:
    - `id`, `space_id`, `source_id` nullable (`SET NULL`)
    - `amount`, `currency`, `received_on` (date)
    - `description`, `member_user_id` nullable, timestamps
- [ ] **CRUD routes** under `/api/v1/spaces/{space_id}/`:
  - `expenses`, `income-sources` and `income-entries`: list, create, get, patch, delete.
  - Lists use cursor pagination, newest date first.
  - Expense filters: `from`, `to`, `category`, `member_user_id`, `contract_id`.
  - Entry filters: `from`, `to`, `source_id`.
- [ ] **Validation** works the same as in HEM-018 (currency, positive amount with correct minor units, ids from the same space, member belongs to the space). Reuse the helpers; don't copy them.
- [ ] **Authorization:** `require_space_member()` on every route. Non-members get 404. Ids from another space get 404 or 422 as in HEM-018.
- [ ] `spent_on` and `received_on` may be at most one day after today (UTC), to allow for time zones. A later date returns 422 (HEM-017 Q10).
- [ ] Expense and income-entry responses include `base_amount`: Money (`{amount, currency}`) in the caller's profile base currency at the record's date, using the HEM-020 FX service. It is null when no rate exists (HEM-017 Q1). This depends on HEM-020 being merged.
- [ ] **Tests:** isolation on every route, cross-space id rejection, date-range filter boundaries (inclusive), pagination, and Decimal round-trip with no float drift (`0.1 + 0.2`).
- [ ] Regenerate the TS client.

## Design notes
- Modules `modules/expenses/` and `modules/income/`.
- Reuse the `Money` schema and validators that HEM-018 adds to `core/`.

## Handoff log

### 2026-11-27 Engineer
- Built `modules/expenses/` and `modules/income/` (sources and entries), migration `0008` (down revision `0006`, the current head), and the CRUD routes with cursor pagination (newest date first; income sources, which have no date, newest created first).
- Records keep flat `amount` and `currency` (string-only input). `base_amount` is Money or null, in the caller's profile base currency at the record's date. List pages go through `fx.service.convert_many`, which looks up each distinct (currency, date) rate once per page instead of twice per row.
- Dates: `spent_on` and `received_on` may be at most 1 day after `get_today()` (UTC); later gets 422 `date_in_future` (`core/dates.py`).
- Shared helpers instead of copies: `categories.service.ensure_category(kind)` and `spaces.service.ensure_member` (contracts now use them too), `core/pagination` date cursors, `fx/base_amount.py`.
- One minor-units table: `fx/service.py` now uses `core/money.minor_units`.
- Deleting a category that has expenses returns 409 `category_in_use` (as for contracts).
- Client regenerated (`npm run gen:api`): `api/openapi.json`, `packages/api-client/src/schema.d.ts`.
- Verify: `cd api && uv run pytest tests/test_expenses_income_db.py` with `DATABASE_URL` set; PR checks.
- Limitations and follow-ups: income entries have no category (per ticket). `convert_many` still costs one query per distinct (currency, date); a single bulk rate query is possible later. `get_today` lives in `contracts.router` and is reused by the new routers; moving it to `core/` is a small follow-up.

## Review
