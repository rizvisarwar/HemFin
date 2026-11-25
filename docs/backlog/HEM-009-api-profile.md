# HEM-009: API, profile and addresses

**Phase:** 1 · **Status:** In Review · **Owner:** Engineer · **Depends on:** HEM-008

## Goal
The current user can read and edit their profile (phone, base currency, locale) and manage their addresses. Nobody can see another user's data.

## Acceptance criteria
- [ ] `profiles` (one-to-one with users): `phone_e164` (nullable; parsed with `phonenumbers`, 422 if invalid), `base_currency` (ISO-4217, default EUR), `locale` (BCP-47, default `en`).
- [ ] `addresses`: label, line1, line2, city, region, postcode, `country` (ISO-3166 alpha-2), `is_default` (at most one per user, enforced by a partial unique index), timestamps. Length limits on every field.
- [ ] Endpoints for the current user only: `GET`/`PATCH /api/v1/me/profile`, `GET`/`POST /api/v1/me/addresses`, `PATCH`/`DELETE /api/v1/me/addresses/{id}`, `POST /api/v1/me/addresses/{id}/default`. Another user's address returns 404.
- [ ] Phone numbers and addresses are never logged.
- [ ] Tests, then the TS client is regenerated.

## Design notes
- The profile row is created lazily (defaults EUR / en) on first read or write.
- Phone must be international (`+` prefix); it is normalised to E.164 and never echoed in error messages.
- Currency and country codes are validated with `pycountry`; locale with a BCP-47 pattern (language, optional script, optional region), canonicalised (`nl-nl` becomes `nl-NL`).
- Address changes take a row lock on the user so concurrent default changes serialise.

## Handoff log

### 2026-11-25 Engineer
- Done: `modules/profile` (models, schemas, service, router), migration `0003`, tests `tests/test_profile_schemas.py` (no DB) and `tests/test_profile_db.py` (CI only), client regenerated.
- Additions beyond the spec (small, say if unwanted): the first address a user adds becomes the default automatically; at most 20 addresses per user (409); explicit `null` clears optional fields on PATCH, and `null` on a required field is a 422.
- Deleting the default address does not promote another one.
- Verify: `cd api && uv run pytest` (db tests need `DATABASE_URL`; CI runs them).
- Stacked on HEM-008 (PR #15) until that merges.

### 2026-11-25 Engineer (review round 1 fixes, PR #16 comments; PR is now #17)
- PR #16 was closed automatically when its base branch was deleted after #15 merged, and GitHub cannot reopen or retarget a closed PR, so the same branch is now PR #17 against main. `origin/main` was merged in (conflicts resolved to main's HEM-008 files; the diff vs main is HEM-009 files only).
1. Added `test_one_default_address_per_user_enforced_by_index` (two `is_default=true` rows inserted directly, expects IntegrityError naming the index).
2. Currency and country codes are stripped and upper-cased before the length check (`" EUR"`, `" nl"` accepted); test added.
3. Only the `uq_addresses_one_default_per_user` violation maps to 409; any other IntegrityError is re-raised (500).
4. 409 responses declared on the POST address and POST default routes.
5. 422 spec drift: not fixed here (PM tracks it).
6. The phone test now asserts the error location and type (`("phone_e164",)`, `value_error`) as well as that the input is not echoed.
7. `npm run check:api-drift` is `node scripts/gen-api.mjs --check`; the comment in `gen-api.mjs` now says so.

## Review
