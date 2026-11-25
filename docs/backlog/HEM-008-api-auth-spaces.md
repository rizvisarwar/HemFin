# HEM-008: API, Supabase JWT auth, users and personal space

**Phase:** 1 · **Status:** In Review · **Owner:** Engineer · **Depends on:** HEM-001 · **Security-sensitive:** yes (PM does the extra security review)

## Goal
The API verifies Supabase access tokens, creates the user and their personal space on first request, and gates spaces by membership (404 for non-members).

## Acceptance criteria
- [ ] `core/security.py` verifies Supabase tokens with the JWKS at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cached with a TTL, refetched (rate limited) on an unknown `kid`. Only ES256/RS256 are accepted; `alg=none` is rejected. `exp`, `iss` (`{SUPABASE_URL}/auth/v1`) and `aud` (`SUPABASE_JWT_AUDIENCE`) are checked with a small leeway.
- [ ] Local CLI HS256: find out whether the local Supabase CLI issues HS256 tokens. If so, HS256 is allowed only when `SUPABASE_JWT_SECRET` (`SecretStr`) is set and `APP_ENV` is `local` or `test`; the reason is documented.
- [ ] `core/deps.py::get_current_user` returns 401 problem+json with `WWW-Authenticate: Bearer`, and never logs tokens.
- [ ] Alembic migration in schema `app`: `users` (id = Supabase `sub`, email, display_name, timestamps), `spaces` (type personal|household, name, created_by, created_at), `space_memberships` (role owner|admin|member, unique on space+user), and a partial unique index so a user has at most one personal space.
- [ ] First authenticated request provisions the user and personal space with an owner membership; idempotent and race-safe.
- [ ] `require_space_member(min_role)`: 404 for non-members and unknown spaces; 403 only for a member with too low a role.
- [ ] `GET /api/v1/me` (user, spaces and roles) and `GET /api/v1/spaces/{space_id}` (membership-gated).
- [ ] Tests with locally generated EC keys and a mocked JWKS (no network): valid token; expired, wrong iss, wrong aud, bad signature, `alg=none`; unknown `kid` refetch; provisioning incl. concurrency (db-marked); user B gets 404 on user A's space.
- [ ] `api/openapi.json` and the TS client regenerated (`npm run gen:api`).

## Design notes
- Provisioning uses `INSERT ... ON CONFLICT DO NOTHING` for the user, the personal space (conflict target is the partial unique index) and the membership, in one transaction. Concurrent first requests converge on one row each.
- Tokens without an `email` claim are rejected (anonymous sign-ins are off).

## Handoff log

### 2026-11-25 Engineer
- Done: see acceptance criteria. New modules `modules/users` and `modules/spaces` (models, service, router, schemas); migration `0002`; `core/security.py`, `core/deps.py`; tests `tests/test_security.py` (no DB) and `tests/test_spaces_db.py` (db-marked, CI only).
- HS256 finding (UNVERIFIED, no Docker available): the local Supabase CLI is understood to sign with the legacy shared JWT secret (HS256) unless `auth.signing_keys_path` is set, and GitHub issues report the signing-keys option misbehaving locally. HS256 is therefore supported, gated as specified, and documented in `core/security.py` and `api/.env.example`. Confirm with `supabase start` + `supabase status`.
- Local host note: the token issuer is `{SUPABASE_URL}/auth/v1`, so locally the API's `SUPABASE_URL` must be the same host the browser uses (`http://127.0.0.1:54321`).
- Verify: `cd api && uv run pytest` (db tests need `DATABASE_URL`; CI runs them), `uv run alembic upgrade head`.
- Limits and follow-ups: db-marked tests could not run locally (no Docker); rely on CI. Display name is not populated yet (HEM-009 / later).

### 2026-11-25 Engineer (review round 1 fixes)
1. Blocking, JWKS outage refetch: `_fetched_at` is now set before the fetch, so failed attempts are rate limited too. With an empty cache the API keeps answering 503 during the cooldown without calling the fetcher. Test: two lookups in the cooldown call the fetcher once, then once more after it.
2. `jwt.decode` now gets a fixed allow-list (`ES256`/`RS256` for JWKS, `["HS256"]` for HS256), not the header alg.
3. The JWK's declared `alg` is stored next to the `PyJWK` when the cache is built; no more `_jwk_data`. Test for `alg_mismatch`.
4. `.gitleaksignore` comment corrected (flagged line was `key = self._hs256_secret`); fingerprint unchanged.
5. `APP_ENV` now defaults to `production`. `.env.example`, Aspire, docker-compose and CI set `local` explicitly; `tests/conftest.py` sets `test`. Test: unset `APP_ENV` plus a secret leaves HS256 off. README and `.env.example` updated.
6. Comment added explaining the single-flight fetch under the lock.

## Review
