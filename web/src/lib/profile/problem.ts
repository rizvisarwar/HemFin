/**
 * Reads an RFC 7807 error from the API (validation errors carry `errors: [{loc, msg}]`) into
 * messages the forms can show. The API never echoes a submitted phone number or address in its
 * messages, and nothing here logs them either.
 */
export interface ProblemFields {
  /** Message per field name (the last element of `loc`, for example "phone_e164"). */
  fields: Record<string, string>;
  /** A message for the form as a whole, when it is not about one field. */
  form?: string;
  status: number;
}

interface ProblemBody {
  detail?: unknown;
  errors?: { loc?: unknown[]; msg?: unknown }[];
}

const FRIENDLY: Record<number, string> = {
  401: "Your session has ended. Sign in again to continue.",
  404: "That item no longer exists. Reload the page and try again.",
  429: "Too many requests. Wait a moment and try again.",
};
export const NETWORK_MESSAGE = "We could not reach the server. Check your connection and try again.";
export const GENERIC_MESSAGE = "Something went wrong. Try again in a moment.";
/** Shown for the 20-address cap, whatever wording the API uses. */
export const ADDRESS_LIMIT_MESSAGE =
  "You have reached the limit of 20 addresses. Delete one you no longer use to add another.";

/** Pydantic prefixes custom validator messages with "Value error, ". */
function cleanMessage(msg: string): string {
  return msg.replace(/^Value error,\s*/i, "");
}

export function parseProblem(status: number, body: unknown): ProblemFields {
  const b = (typeof body === "object" && body !== null ? body : {}) as ProblemBody;
  const fields: Record<string, string> = {};
  if (Array.isArray(b.errors)) {
    for (const e of b.errors) {
      const name = Array.isArray(e.loc) ? String(e.loc[e.loc.length - 1] ?? "") : "";
      const msg = typeof e.msg === "string" ? cleanMessage(e.msg) : "";
      // Keep the first message per field.
      if (name && name !== "body" && msg && !(name in fields)) fields[name] = msg;
    }
  }
  let form: string | undefined;
  if (Object.keys(fields).length === 0) {
    if (status === 409 && typeof b.detail === "string") form = b.detail;
    else if (FRIENDLY[status]) form = FRIENDLY[status];
    else if (status === 422) form = "Check the highlighted fields and try again.";
    else form = GENERIC_MESSAGE;
  }
  return { fields, form, status };
}
