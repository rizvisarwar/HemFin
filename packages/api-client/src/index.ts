import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./schema";

export type { paths, components } from "./schema";

export type GetToken = () => string | null | undefined | Promise<string | null | undefined>;

/** Typed HemFin API client. `getToken` (optional) supplies a bearer token per request. */
export function createApiClient(baseUrl: string, getToken?: GetToken) {
  const client = createClient<paths>({ baseUrl: baseUrl.replace(/\/+$/, "") });
  if (getToken) {
    const auth: Middleware = {
      async onRequest({ request }) {
        const token = await getToken();
        if (token) request.headers.set("Authorization", `Bearer ${token}`);
        return request;
      },
    };
    client.use(auth);
  }
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
