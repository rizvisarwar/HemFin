# HEM-004: Generated TypeScript API client

**Phase:** 0 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-001, HEM-003

## Goal
Generate a typed client from `api/openapi.json` and use it in the web app.

## Acceptance criteria
- [ ] Root `package.json` (npm workspaces: `web`, `packages/*`) with script `gen:api` = export OpenAPI (via `uv run` in api/) + generate types.
- [ ] `packages/api-client`: openapi-typescript generated `schema.d.ts` + small `createApiClient(baseUrl, getToken?)` wrapper using openapi-fetch.
- [ ] Web landing health badge uses the client.
- [ ] Carried over from the HEM-003 review: move `shadcn` from `dependencies` to `devDependencies`. Change the focus test to use `keyboard.press("Tab")` and assert a non-`none` outline, rather than accepting any box-shadow.
- [ ] Script `check:api-drift` regenerates and fails if `git diff` is non-empty (used by CI).

## Design notes

## Handoff log

### 2026-11-25 Engineer
**Done:** Root npm workspaces (`web`, `packages/*`) with a single root `package-lock.json` (`web/package-lock.json` removed). `packages/api-client` has openapi-typescript 7.9.1 (generated `src/schema.d.ts`) and a `createApiClient(baseUrl, getToken?)` wrapper over openapi-fetch 0.14.0. The package exports TypeScript source. Next 16 transpiles workspace packages automatically under Turbopack (per `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/transpilePackages.md`), so there is no build step and no `transpilePackages` entry. `scripts/gen-api.mjs` exports the spec with `uv`, falling back to `py -m uv`, `python3 -m uv`, `python -m uv`, then runs openapi-typescript. `npm run check:api-drift` runs the same script with `--check` and fails if `api/openapi.json` or `schema.d.ts` differ from what is committed (it uses `git status --porcelain`, so untracked files count too). The landing `ApiStatus` (`web/src/components/api-status.tsx`) now calls `client.GET("/health")` with the same 2 s `AbortSignal.timeout` and offline fallback. HEM-003 carry-overs: `shadcn` moved to `devDependencies`; the focus test now presses Tab and asserts `outline-style != none` and width > 0.

**Finding (focus test on phone):** the phone project runs WebKit, which does not Tab to plain `<a>` links, so the bottom-nav links can't be reached by Tab there. On phone the test checks the space-switcher button instead; tablet and desktop check the first side-nav link.

**Vercel with npm workspaces and Root Directory `web` (not verifiable from here, no Vercel access):** Vercel installs from the repo root when it finds the lockfile and workspaces above the Root Directory, provided "Include source files outside of the Root Directory in the Build Step" is on (the default). `@hemfin/api-client` then resolves through the root `node_modules` symlink, and Next's workspace-root detection (root lockfile) finds `packages/api-client`. Confirm on the first preview deploy in HEM-006: keep that setting on, leave the install command default and use build command `next build`. If install runs only inside `web`, set the Install Command to `cd .. && npm ci`. `npm ci` at the root and `next build` in `web` were both verified locally.

**Verify:** `npm ci`; `npm run gen:api`; `npm run check:api-drift`; `cd web && npm run lint && npm run build && npx playwright test`; `cd api && py -m uv run pytest`.

**Follow-ups:** HEM-006 CI should run `npm ci` at the root and `npm run check:api-drift` (needs uv and Node on the runner). `/health/ready` has an untyped response schema in the spec; type it when the client is used beyond the health badge. The api-client package has `typecheck` but no tests yet. Board status left for the PM to update.

## Review
