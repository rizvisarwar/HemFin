/**
 * Maps a problem+json response from a finance endpoint to field errors (by API field name, F8) and a
 * form-level message (docs/design/finance.md 3.10). Builds on the profile's reader.
 */
import { parseProblem, type ProblemFields } from "../profile/problem.ts";
import { FUTURE_DATE_MESSAGE } from "./common.ts";

/** The API reports a foreign category, member, contract or source with a code and a plain detail, not an `errors[]` entry. */
const CODE_FIELD: Record<string, string> = {
  invalid_category: "category_id",
  invalid_member: "member_user_id",
  invalid_contract: "contract_id",
  invalid_source: "source_id",
  invalid_amount: "amount",
};
const DATE_FIELDS = ["spent_on", "received_on"];

export function financeProblem(status: number, body: unknown): ProblemFields {
  const problem = parseProblem(status, body);
  const b = (typeof body === "object" && body !== null ? body : {}) as { code?: unknown; detail?: unknown };
  const code = typeof b.code === "string" ? b.code : "";
  const detail = typeof b.detail === "string" && b.detail.trim() !== "" ? b.detail : undefined;
  if (code === "date_in_future" && detail) {
    // "spent_on cannot be more than a day in the future." names its field first.
    const field = DATE_FIELDS.find((f) => detail.startsWith(f));
    if (field) return { fields: { ...problem.fields, [field]: FUTURE_DATE_MESSAGE }, status };
  }
  const field = CODE_FIELD[code];
  if (field && detail) return { fields: { ...problem.fields, [field]: detail }, status };
  return problem;
}
