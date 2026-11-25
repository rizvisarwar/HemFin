/** Public API base URL. Only public values may use the NEXT_PUBLIC_ prefix. */
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");
