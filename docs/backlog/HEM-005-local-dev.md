# HEM-005: Local dev orchestration (Aspire, Supabase CLI, docker-compose)

**Phase:** 0 · **Status:** Todo · **Owner:** Engineer · **Depends on:** HEM-001, HEM-003

## Goal
One-command local stack.

## Acceptance criteria
- [ ] `supabase/` initialised (`npx supabase init`), config sets site_url http://localhost:3000, Google provider stubbed (disabled, env-driven), and the `app` schema NOT added to exposed API schemas.
- [ ] `aspire/HemFin.AppHost` (Aspire 13, net10.0): api via Python hosting (`AddUvicornApp` or equivalent) and web via JavaScript hosting, env wired (DATABASE_URL to local Supabase Postgres 127.0.0.1:54322, NEXT_PUBLIC_API_URL to the api endpoint), OTEL to dashboard. Add OpenTelemetry instrumentation to the API (optional, env-enabled).
- [ ] `docker-compose.yml` alternative: postgres:16 + api + web for those without Supabase CLI/Aspire.
- [ ] Root `README.md`: prerequisites, quick start for both paths, env files, common commands.
- [ ] `dotnet build` of the AppHost succeeds. (Docker may not be running on the build machine; document manual verification steps if it cannot be run.)

## Design notes

## Handoff log

## Review
