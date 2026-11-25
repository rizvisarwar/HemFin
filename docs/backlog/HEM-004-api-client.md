# HEM-004: Generated TypeScript API client

**Phase:** 0 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-001, HEM-003

## Goal
Generate a typed client from `api/openapi.json` and use it in the web app.

## Acceptance criteria
- [ ] Root `package.json` (npm workspaces: `web`, `packages/*`) with script `gen:api` = export OpenAPI (via `uv run` in api/) + generate types.
- [ ] `packages/api-client`: openapi-typescript generated `schema.d.ts` + small `createApiClient(baseUrl, getToken?)` wrapper using openapi-fetch.
- [ ] Web landing health badge uses the client.
- [ ] Script `check:api-drift` regenerates and fails if `git diff` is non-empty (used by CI).

## Design notes

## Handoff log

## Review
