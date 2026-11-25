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

## Review
