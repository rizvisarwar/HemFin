# HEM-020: API, exchange rates and FX job

**Phase:** 3 · **Status:** In Review · **Owner:** Engineer · **Depends on:** none

## Goal
The API stores daily ECB reference rates and can convert any amount between currencies for a given date. The dashboard (HEM-023) and later reports will use this.

## Acceptance criteria
- [ ] **Migration:** `app.fx_rates`: `rate_date` (date), `base` (always `EUR`), `quote` char(3), `rate` `Numeric(18,8)`, `fetched_at` timestamptz. Primary key `(rate_date, quote)`.
- [ ] **`POST /internal/jobs/fx`** (job secret, same guard as `/daily`):
  - Fetches the ECB daily reference rates (`https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`). The URL comes from a non-secret setting with that default.
  - Upserts them; running it twice is a no-op.
  - Returns `{rate_date, count}`.
  - Uses a short httpx timeout, and a fetch error returns a problem+json 502 without crashing.
  - Parse XML safely: `defusedxml`, or reject DTDs or entities.
  - On first run against an empty table, backfill from the 90-day feed (`eurofxref-hist-90d.xml`) so conversions for recent dates work right away.
- [ ] **`jobs-cron.yml`:** add an `fx` schedule on weekdays around 16:30 UTC (after ECB publishes) and the `fx` option for manual runs. Keep the case statement in sync. Push with the gh credential helper, as CLAUDE.md says.
- [ ] **FX service** `modules/fx/service.py`:
  - `convert(amount, from_ccy, to_ccy, on_date) -> Decimal | None`.
  - Goes through EUR as the cross currency.
  - Uses the latest rate on or before `on_date`, at most 7 days back.
  - Same currency returns the amount unchanged.
  - Returns `None` when no rate exists. It never guesses.
  - Rounds to the target currency's minor units with ROUND_HALF_EVEN, and only at the end.
- [ ] **`GET /api/v1/fx/rates?date=`** (any signed-in user; this is public reference data, not space data) returns the rates for that date, or for the latest date on or before it.
- [ ] **Tests:**
  - XML parsing from a fixture file, including a malicious XML case.
  - Idempotent upsert.
  - Conversions: same currency, EUR to X, X to EUR, X to Y cross, missing rate gives None, the 7-day lookback limit, rounding.
  - Job auth: 401 and 503.
  - The HTTP fetch is mocked. Tests never call the ECB.
- [ ] Update `.env.example` and the docs if a new setting is added.
- [ ] Regenerate the TS client.

## Handoff log

### 2026-11-27 Engineer
Built the FX table, the `POST /internal/jobs/fx` job, `modules/fx` (service, router, schemas, model), `GET /api/v1/fx/rates`, the cron entry and the regenerated client. PR URL is on the PR itself (branch `hem-020-api-fx`).

- Migration `0007` currently has `down_revision = "0005"`, because 0006 (HEM-018) is not on main yet. PM: re-point it to `"0006"` when rebasing the chain at merge.
- New non-secret settings (in `.env.example`): `FX_ECB_DAILY_URL`, `FX_ECB_HIST_URL`, `FX_FETCH_TIMEOUT_SECONDS` (10).
- `convert(session, amount, from_ccy, to_ccy, on_date)` takes the session as its first argument because it reads the table. Each currency uses its own latest rate within 7 days of `on_date`. Same currency returns the amount as given (not rounded).
- Upsert is `ON CONFLICT DO NOTHING`: a re-run changes nothing, and stored ECB rates are never overwritten. The job returns the latest date in the fetched feed and the number of rates on that date. An empty table is backfilled from the 90-day feed.
- `GET /api/v1/fx/rates?date=` defaults to today (UTC) and returns 404 problem+json if nothing exists on or before the date. Values are decimal strings.
- Minor units come from a small table in `service.py` (ISO 4217 zero- and three-decimal currencies); everything else is 2.
- `defusedxml` (plus `types-defusedxml` as a dev dependency for mypy) parses the feed with DTDs forbidden. Feed size is capped at 5 MB and redirects are not followed.

How to verify: `cd api; uv run pytest tests/test_fx.py`; with `DATABASE_URL` set also `tests/test_fx_db.py`. After deploy, run the "Scheduled jobs" workflow manually with job `fx`.

CI status after the fix commit: `api` and `docker` pass (db tests ran in CI). `gitleaks` fails on one false positive in history (commit `4cd20c7`, `api/tests/test_fx.py:229`, a feed-URL test setting; the line is already reworded). It needs the exact-fingerprint line `4cd20c73e019b48b6b97dd9f8ac36f11149b34fd:api/tests/test_fx.py:generic-api-key:229` appended to `.gitleaksignore`; my attempt to commit that was refused by the permission check, so I did not add it. `web` fails on `tests/invitations-screens.spec.ts:249` (accept page F/H), a web test this ticket does not touch.

Known limits and follow-ups:
- The `db`-marked tests (`tests/test_fx_db.py`, 4 tests, plus all existing db tests) cannot run locally (no Postgres); CI runs them.
- Follow-up: `jobs-cron.yml` has no way to alert on repeated 502s from the ECB; GitHub's failed-run emails are the only signal.
- Follow-up: once a web ticket needs it, expose a convert endpoint; only the service function exists now.

## Review
