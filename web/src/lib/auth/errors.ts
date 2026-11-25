/**
 * Maps Supabase auth errors to user-facing copy.
 *
 * Rule: the copy must never reveal whether an email address has an account. So "wrong password",
 * "no such user" and "email not confirmed" all read the same on sign-in, "already registered"
 * is treated as a normal sign-up, and password reset always says the same thing.
 */
export type AuthFlow = "sign-in" | "sign-up" | "forgot-password" | "reset-password" | "resend" | "oauth";

export interface AuthErrorLike {
  code?: string | null;
  status?: number | null;
  message?: string | null;
  name?: string | null;
}

export interface MappedAuthError {
  message: string;
  /** The flow should carry on as if it had succeeded (the error would reveal an account). */
  treatAsSuccess: boolean;
}

export const GENERIC_SIGN_IN_ERROR =
  "We could not sign you in. Check your email and password. If you just signed up, confirm your email address first.";
export const RATE_LIMIT_ERROR = "Too many attempts. Wait a minute and try again.";
export const NETWORK_ERROR = "We could not reach the server. Check your connection and try again.";
export const GENERIC_ERROR = "Something went wrong. Try again in a moment.";
export const WEAK_PASSWORD_ERROR = "Choose a stronger password that meets all the rules below.";
export const SAME_PASSWORD_ERROR = "Choose a password you have not used before.";
export const LINK_EXPIRED_ERROR = "This link has expired or was already used. Request a new one.";
export const RESET_REQUESTED_MESSAGE =
  "If an account exists for that email address, we have sent a link to reset the password.";
export const CHECK_EMAIL_MESSAGE =
  "If this email address can be used, we have sent a message with a link. It can take a few minutes.";

function isNetwork(e: AuthErrorLike): boolean {
  const m = `${e.name ?? ""} ${e.message ?? ""}`.toLowerCase();
  return e.status === 0 || m.includes("failed to fetch") || m.includes("network") || m.includes("fetch failed");
}

export function mapAuthError(error: AuthErrorLike, flow: AuthFlow): MappedAuthError {
  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();

  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || error.status === 429) {
    return { message: RATE_LIMIT_ERROR, treatAsSuccess: false };
  }
  if (isNetwork(error)) return { message: NETWORK_ERROR, treatAsSuccess: false };

  switch (flow) {
    case "sign-in":
      // invalid_credentials, email_not_confirmed, user_not_found and anything else: one message.
      return { message: GENERIC_SIGN_IN_ERROR, treatAsSuccess: false };
    case "sign-up":
      if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered")) {
        return { message: CHECK_EMAIL_MESSAGE, treatAsSuccess: true };
      }
      if (code === "weak_password") return { message: WEAK_PASSWORD_ERROR, treatAsSuccess: false };
      if (code === "email_address_invalid" || code === "validation_failed") {
        return { message: "Enter a valid email address.", treatAsSuccess: false };
      }
      return { message: GENERIC_ERROR, treatAsSuccess: false };
    case "forgot-password":
    case "resend":
      // Any non-rate-limit outcome looks like success: the user learns nothing about the account.
      return { message: flow === "resend" ? CHECK_EMAIL_MESSAGE : RESET_REQUESTED_MESSAGE, treatAsSuccess: true };
    case "reset-password":
      if (code === "weak_password") return { message: WEAK_PASSWORD_ERROR, treatAsSuccess: false };
      if (code === "same_password") return { message: SAME_PASSWORD_ERROR, treatAsSuccess: false };
      if (code === "session_not_found" || code === "no_authorization" || error.status === 401 || error.name === "AuthSessionMissingError") {
        return { message: LINK_EXPIRED_ERROR, treatAsSuccess: false };
      }
      return { message: GENERIC_ERROR, treatAsSuccess: false };
    case "oauth":
      return { message: "We could not start sign-in with Google. Try again, or use your email and password.", treatAsSuccess: false };
  }
}
