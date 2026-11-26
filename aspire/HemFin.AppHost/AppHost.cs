// Local orchestration for HemFin: FastAPI (api/) + Next.js (web/) with the Aspire dashboard.
// Postgres is the Supabase CLI database (`npx supabase start`), not an Aspire-managed container.

var builder = DistributedApplication.CreateBuilder(args);

// SECRET. Local Supabase Postgres URL (see `npx supabase status`, "DB URL"). Never committed:
// set it with `dotnet user-secrets set Parameters:database-url "<url>"` (see README).
var databaseUrl = builder.AddParameter("database-url", secret: true);

// NOT secret (public by design; the browser sees both). Local Supabase API URL and its anon key
// from `npx supabase status` ("Project URL" and "Publishable"/"anon key"). Set with
// `dotnet user-secrets set Parameters:supabase-anon-key "<key>"`. Never put a service-role key here.
var supabaseUrl = builder.AddParameter("supabase-url", "http://127.0.0.1:54321");
var supabaseAnonKey = builder.AddParameter("supabase-anon-key");

// API: uvicorn + uv (api/pyproject.toml). Aspire is expected to inject the OTEL_* variables
// (verify in manual step 3), which turns on the opt-in OpenTelemetry in hemfin.core.telemetry.
var api = builder.AddUvicornApp("api", "../../api", "hemfin.main:app")
    .WithEnvironment("APP_ENV", "local")
    .WithEnvironment("DATABASE_URL", databaseUrl)
    // Local Supabase Auth. The API verifies tokens against {SUPABASE_URL}/auth/v1/.well-known/jwks.json,
    // and the issuer must match what the browser sees, so use the same host as the web app below.
    .WithEnvironment("SUPABASE_URL", supabaseUrl)
    .WithEnvironment("CORS_ORIGINS", "http://localhost:3000")
    .WithHttpHealthCheck("/health");

// Web: `npm run dev` on the fixed port 3000 (matches Supabase site_url and the API CORS origin).
// NEXT_PUBLIC_API_URL is read by the browser, so it must be the host-reachable API URL.
builder.AddJavaScriptApp("web", "../../web", "dev")
    .WithHttpEndpoint(port: 3000, env: "PORT", isProxied: false)
    .WithEnvironment("NEXT_PUBLIC_API_URL", api.GetEndpoint("http"))
    .WithEnvironment("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl)
    .WithEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY", supabaseAnonKey)
    .WaitFor(api);

builder.Build().Run();
