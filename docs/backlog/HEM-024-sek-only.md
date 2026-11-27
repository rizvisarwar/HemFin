# HEM-024: SEK only, remove multi-currency (API and web)

**Phase:** 3 (follow-up) · **Status:** In Review · **Owner:** Engineer · **Depends on:** HEM-018 to HEM-023

## Goal
The user decided on 2026-11-27 that the POC is for Sweden only and uses SEK. Remove multi-currency support and keep the code simple. Records keep a `currency` column and responses keep `currency: "SEK"`, so CLAUDE.md rule 3 still holds and multi-currency can return later without a data migration.

## Decisions (from the user, final)
1. **Data model.** Keep a `currency` column on contracts, expenses, income sources and income entries. The server always sets it to "SEK"; it is no longer an input.
2. **Format.** UI text stays English. Numbers and dates use Swedish conventions (sv-SE): amounts like "1 234,50 kr", dates like "1 jan. 2027". Amount fields accept a decimal comma ("12,50") and also a dot ("12.50").

## Acceptance criteria
**API**
- [ ] Remove the FX feature completely: `modules/fx`, `GET /api/v1/fx/rates`, `POST /internal/jobs/fx`, the `FX_*` settings and their `.env.example` entries, the `defusedxml` and `types-defusedxml` dependencies, and the FX tests and fixtures. Keep the `.gitleaksignore` entries.
- [ ] Alembic migration `0009` (down_revision "0008") drops `app.fx_rates`; its downgrade recreates the table as in 0007. Old migrations are untouched.
- [ ] Contracts, expenses, income sources and entries: create and patch no longer take `currency` (extra fields are ignored); the server writes "SEK"; the column gets `server_default 'SEK'`; no CHECK constraint (older rows may hold other codes and display their own). Amount validation: > 0, at most 2 decimals, strict string input.
- [ ] Simplify `core/money.py` (no minor-units table, no `Currency` type). Keep the Money/MoneyBase output shape `{amount, currency}`.
- [ ] Remove `base_amount` from expense and income-entry responses.
- [ ] Dashboard: remove `base_currency` and `unconverted_count`. Totals are plain Decimal sums in SEK, still Money-shaped. Keep `has_records`, upcoming and the recurring normalisation. Records whose stored currency is not SEK are excluded from totals (noted in a code comment; no UI).
- [ ] Profile: `base_currency` is no longer editable (removed from the PATCH schema), still readable; its server default becomes "SEK" (via the migration). The column stays.
- [ ] `jobs-cron.yml`: remove the `fx` schedule, option and case entries; keep `daily` and `weekly`.
- [ ] Update the tests. Regenerate the client with `npm run gen:api`.

**Web**
- [ ] `AmountInput` has no currency select; it shows a "kr" suffix. `currencyError` and its plumbing are removed. `ConvertedAmount` and every `base_amount` use are removed. The dashboard unconverted hint and its tests are removed.
- [ ] The currency field is removed from the contract, expense and income forms and their problem mapping. The base-currency field is removed from the profile page.
- [ ] Formatting through `FormatProvider` and the format lib: always sv-SE for money and calendar dates, tabular numbers, no float parsing, `whitespace-nowrap` on amounts.
- [ ] Amount parsing accepts "12,50", "12.50", "12" and "1 234,50" (regular or non-breaking spaces between digit groups). It rejects more than one decimal mark, more than 2 decimals, letters and signs. Hint: "Use a comma before the öre, like 12,50." The value sent to the API is always a dot-decimal string. Unit-tested.
- [ ] Playwright tests and the mock backend are updated; screenshots for the touched screens are regenerated under `web/test-results/screenshots/hem024/`.

**Docs**
- [ ] `docs/PROJECT_PLAN.md`: Market decision is "Sweden only, SEK (POC, user decision 2026-11-27). Multi-currency later."; "Multi-currency with an FX cron job" is removed from Phase 3; FX and `FxRate` are removed from the architecture and data model with a one-line "deferred" note.
- [ ] `docs/design/finance.md`: shared blocks and fields marked "Removed (SEK only, HEM-024)".
- [ ] `docs/backlog/board.md`: HEM-024 row added under Phase 3; the FX follow-up line removed.
- [ ] `docs/deploy.md`: FX settings mentions removed (none were present).

## Handoff log

### 2026-11-27 Engineer
Removed multi-currency. PR: https://github.com/rizvisarwar/HemFin/pull/34

**What changed**
- API: FX module, routes, settings, `defusedxml` and tests removed. Migration 0009 drops `app.fx_rates` (downgrade recreates it as in 0007) and sets `server_default 'SEK'` on the four `currency` columns and on `profiles.base_currency`. `core/money.py` is now `Amount`, `validate_amount`, `AmountIn` (input) and `MoneyBase` (output). Create and patch ignore a client-sent `currency` (default pydantic behaviour; the profile PATCH keeps `extra=forbid`, so `base_currency` there is a 422). Dashboard sums only rows stored as SEK.
- Web: sv-SE `format.ts`, `FormatProvider` without props (the layout no longer fetches the profile), `parseAmount(raw)`, `AmountInput` with "kr". A row stored in another currency shows its own ISO code. Month headings stay English ("November 2026").
- The profile Locale field stays (it still seeds the phone country); its hint now says numbers and dates use the Swedish format for now.

**How to verify**
- API: ruff, mypy, pytest (334 passed) against Postgres 16, `alembic upgrade head` and the roundtrip test.
- Web: lint, `npm --prefix web test` (unit), build, full Playwright. Screenshots: `web/test-results/screenshots/hem024/`.

**Known limitations and follow-ups**
- Existing profiles keep their stored `base_currency` (not rewritten); it is unused.
- `docs/design/app-shell.md`, `design-system.md` and `profile.md` still mention currency; only `finance.md` was updated, as asked.
- Service functions still take an unused `user_id` argument in expenses and income (kept to avoid router churn).
