import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseEnv } from "./env";

/** Supabase client for Server Components, Server Actions and Route Handlers. */
export async function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const jar = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Called from a Server Component, which cannot set cookies. The proxy refreshes the
          // session on every request, so ignoring this is safe.
        }
      },
    },
  });
}
