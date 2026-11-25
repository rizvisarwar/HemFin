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

### 2026-11-25 Round 1 (reviewer-tester)
**CHANGES_REQUESTED**

Checks run on `hem-004-api-client` @ 7d77237: `npm ci`, `npm run gen:api`, `npm run check:api-drift` (pass, clean tree), web `lint`/`build`/`playwright test` (pass, 24/24), api `ruff check`/`ruff format --check`/`mypy src`/`pytest` (pass, 18 passed 3 skipped), `@hemfin/api-client` typecheck (pass).

Findings:
1. **blocking:** `packages/api-client/src/index.ts:9-20`. The token middleware is the only security-relevant code in this ticket and has no test. CLAUDE.md rule 8 requires tests, and the review checklist requires each acceptance criterion to have one. Add a small test (for example `node --test --experimental-strip-types` in `packages/api-client`, with a stubbed `fetch`) covering: `Authorization: Bearer <token>` is set when `getToken` returns a value; the header is absent when it returns `null`; and the token never appears in the URL.
2. **nit:** `scripts/gen-api.mjs:20-22`. Fallback only runs when the command is missing (`res.error`). If `py` exists but has no `uv` module, `py -m uv` exits 1 and the script throws without trying `python3`/`python`. Also, `git()` at line 30 drops `res.error`, so a missing git gives no reason. Fall back on any non-zero exit from the uv probe, and include `res.error.message`.
3. **nit:** drift check design. `gen-api.mjs --check` regenerates before comparing, so a hand edit to `api/openapi.json` is overwritten and the check passes (verified: changed the title to "HemFin API DRIFT TEST", check passed and the file was restored by regeneration). This is correct for real drift, but the "edit the spec and expect failure" test from the review plan cannot fail by design. The realistic test (change the API source without regenerating) was not run: my attempt to edit `api/src/hemfin/main.py` was refused by the permission system, and reviewers don't edit app code. The PM or a human should run it once: change `api/src/hemfin/main.py:35` title, run `npm run check:api-drift`, expect exit 1, then `git checkout -- .`.
4. **nit:** `web/tests/smoke.spec.ts:97-98` (phone focus test). The WebKit deviation is acceptable. Real Tab is used, the switcher button is a focusable control in the phone header, and the test passes. Note that bottom-nav link focus styling is no longer asserted on phone at all. Consider a second check on phone that focuses a bottom-nav link with `.focus()` and asserts the outline, so that coverage is not lost.
5. **nit:** `web/tests/smoke.spec.ts:34-45` covers only the offline badge. The online state and the 2 s timeout in `web/src/components/api-status.tsx:29-31` are untested. Acceptable for this ticket, but worth a follow-up.
6. **nit:** `api/openapi.json` has no "do not edit" marker (JSON cannot carry a comment). `schema.d.ts` is marked correctly. Document in the handoff or README that `api/openapi.json` is generated by `npm run gen:api`.
7. **nit (follow-up, not blocking):** the Vercel workspace install is still unverified (noted in the handoff). Confirm in HEM-006 as the handoff says.

Acceptance criteria: 1, 2, 3, 4 and 5 are met in code. Criterion 2 (wrapper) is pending finding 1.
Shadcn/devDependencies: pass (`web/package.json`). Focus test uses `keyboard.press("Tab")` and asserts a non-`none` outline with width > 0: pass.
Health badge: keeps the 2 s `AbortSignal.timeout`, renders "offline" when the API is unreachable (test passes), no token is sent or logged. Pass.
Generated `schema.d.ts`: header says "Do not make direct changes to the file." Pass.
Privacy, RFC 7807, migrations and secrets checklist items: not affected (no API or config change; `api/openapi.json` unchanged in the diff). N/A.
