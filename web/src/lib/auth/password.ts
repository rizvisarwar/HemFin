/** Password policy. Mirrors `minimum_password_length` and `password_requirements` in supabase/config.jsonc. */
export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, test: (p) => p.length >= MIN_PASSWORD_LENGTH },
  { id: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "digit", label: "A number", test: (p) => /[0-9]/.test(p) },
];

export function passwordRuleResults(password: string) {
  return PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, met: r.test(password) }));
}

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(password));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isEmailValid(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email.trim());
}
