/**
 * Public Supabase settings. Both values are public by design (the anon key only works within
 * Row Level Security, and HemFin keeps all data in the `app` schema behind the API). No server
 * secret ever belongs in the web app.
 *
 * NEXT_PUBLIC_ variables must be read as literal `process.env.NEXT_PUBLIC_X` so Next.js can
 * inline them into the browser bundle.
 */
export function getSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/+$/, ""), anonKey };
}

export function requireSupabaseEnv(): { url: string; anonKey: string } {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.");
  }
  return env;
}
