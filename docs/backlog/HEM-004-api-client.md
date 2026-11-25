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

### 2026-11-25 Engineer, round 1 fixes
1. Blocking, client tests: `packages/api-client/src/index.test.ts` (node:test, mocked `globalThis.fetch`) covers the Bearer header, async `getToken`, null/undefined token (no header), no `getToken`, and the token never appearing in the URL. `npm test --workspaces --if-present` runs it. Tests run `.ts` directly via Node type stripping (Node 22.18+/24; CI must use such a Node).
2. `gen-api.mjs` now falls through to the next uv candidate on spawn errors and on non-zero exit, and the final error lists every candidate with its reason. `git()` surfaces `res.error` or stderr.
3. Drift verification: changed `title="HemFin API"` to `"HemFin API DRIFT"` in `api/src/hemfin/main.py` and ran `npm run check:api-drift`. Output ended with:
   ```
   API drift: generated files are out of date. Run "npm run gen:api" and commit:
   M api/openapi.json
   exit=1
   ```
   Reverted with `git checkout -- .`, tree clean, and `check:api-drift` passes again. Not committed.
4. Phone project: new test focuses the first bottom-nav link programmatically (after one Tab press to enter keyboard modality) and asserts outline style is not `none` and width > 0. It is skipped on tablet and desktop. The Tab-to-switcher check stays.
5. Badge logic moved to a pure `fetchApiStatus(client, timeoutMs)` in `web/src/lib/api-health.ts` (`ApiStatus` uses it). `web/src/lib/api-health.test.ts` (node:test, fake client) covers online, non-2xx, thrown error, timeout abort, and the 2 s default. `web` has a `test` script; added `allowImportingTsExtensions` to the web and api-client tsconfigs for the `.ts` test imports.
6, 7. Accepted and deferred, no change.

**Results:** `npm ci`; `npm test --workspaces --if-present` 5 + 5 pass; `npm run gen:api`; drift check passes; web lint clean; web build ok; Playwright 25 passed, 2 skipped (the phone-only test on tablet and desktop).

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

### 2026-11-25 Round 2 (reviewer-tester)
**APPROVED**

Checks run on `hem-004-api-client` @ 30cffdb: `npm ci`; `npm test --workspaces --if-present` (api-client 5/5, web 5/5); `npm run gen:api`; `npm run check:api-drift` ("API client is up to date."); web `lint` (clean), `build` (ok, the TypeScript pass includes the new `.ts` test files), `npx playwright test` (25 passed, 2 skipped: the phone-only test on tablet and desktop); `@hemfin/api-client` typecheck (clean). No API files changed since Round 1, so the Round 1 api checks still stand.

Round 1 findings:
1. **Resolved.** `packages/api-client/src/index.test.ts` was read in full. It mocks `globalThis.fetch` and inspects the real `Request` objects. It covers: `Authorization: Bearer abc123` (sync `getToken`); the async token; `null` and `undefined` tokens, with no header on either request; no `getToken`, no header; and the token absent from the URL, with trailing slashes trimmed. The assertions are meaningful, not just "runs".
2. **Resolved.** `scripts/gen-api.mjs:17-30` now tries the next candidate on spawn errors and on non-zero exit, and the final error lists each candidate with its reason. `git()` includes `res.error` or stderr. Trade-off (nit): a genuine export failure now runs the script under all four candidates before failing. Harmless, just slower.
3. **Accepted on the engineer's logged output, not reproduced here.** The Handoff log (round 1 fixes, item 3) shows the source title edit, `npm run check:api-drift` exit=1 with `M api/openapi.json`, and a clean revert. The output is consistent with the script: the title lives in `openapi.json` only, so `schema.d.ts` is not expected in the list. I did not repeat the code edit. The check passes on the committed tree, as shown above.
4. **Resolved.** The phone bottom-nav link now has its own outline assertion (`web/tests/smoke.spec.ts:115-128`, skipped off phone). It uses one real Tab to enter keyboard modality, then `.focus()`, so it does not test Tab-reachability. That is acceptable alongside the switcher Tab test.
5. **Resolved at unit level.** `web/src/lib/api-health.test.ts` covers online (asserts `cache: "no-store"` and an `AbortSignal`), non-2xx, a thrown error, and a timeout abort (50 ms, under 1.5 s). `fetchApiStatus` is the function `ApiStatus` uses (`web/src/components/api-status.tsx:29`).

Node and tsconfig check:
- The tests need Node 22.18+ for type stripping. Node 24.19 is used here. Nothing in the repo pins this yet (no `engines`, no `.nvmrc`). **Nit:** add `"engines": { "node": ">=22.18" }` to the root `package.json`, or a `.nvmrc`, and make the HEM-006 CI use it.
- `allowImportingTsExtensions` was added to `web/tsconfig.json` and `packages/api-client/tsconfig.json`. Both already set `noEmit: true`, which the option requires. The web build and the api-client typecheck both pass, so it does not break them.

New nits:
- `web/src/lib/api-health.test.ts` "keeps the 2 s default timeout" asserts a constant, not that `fetchApiStatus` uses it when no timeout is passed.
- The `api/openapi.json` marker note from Round 1 (finding 6) is still open. Deferred.
- The Vercel workspace install (finding 7) is still for HEM-006.

No blocking findings remain.
