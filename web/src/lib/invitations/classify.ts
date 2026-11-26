export type Outcome = "ok" | "auth" | "generic" | "server";

/**
 * One mapping for the preview, accept and decline calls. Every invitee-side 4xx except 401 and 429
 * is the one generic state (the API answers 404 for all of them, and nothing may say which check
 * failed). 401 means the session ended. 429 and 5xx are transient and not about the invitation, so
 * they get the "try again" state.
 */
export function classify(status: number): Outcome {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401) return "auth";
  if (status === 429 || status >= 500) return "server";
  return "generic";
}
