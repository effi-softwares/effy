import { isDomainError } from "@effy/api-client";

/**
 * Non-leaking copy for promotion refusals (094). The admin service names each refusal by its problem
 * `type`; we map it to our OWN words (never the server's `detail`), because the operator's next move
 * differs: a used promotion keeps what it gives (archive or start a new one), a taken code needs another
 * code, a stale edit needs a reload.
 */
const BY_TYPE: Record<string, string> = {
  "promotion-used": "This promotion has been used, so what it gives and who it is for can no longer change. Its dates, limits, words and groups still can.",
  "code-taken": "That code is already used by another promotion. Choose a different code.",
  stale: "Someone else changed this promotion. Reload it to see their change, then try again.",
  "headline-required": "Add a headline before showing this promotion in a group.",
  "action-not-allowed": "That can't be done to a promotion in its current state.",
  "key-taken": "That key is already used by another group.",
};

export function promotionMutationError(err: unknown): string {
  if (isDomainError(err)) {
    const slug = err.type?.split("/").pop() ?? "";
    if (BY_TYPE[slug]) return BY_TYPE[slug];
    if (err.kind === "forbidden") return "You don't have permission to do this.";
    if (err.kind === "not-found") return "That promotion no longer exists.";
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment.";
    if (err.status === 400 || err.status === 422) {
      const fields = (err.fields ?? []).map((f) => f.field).filter(Boolean);
      return fields.length ? `Check ${fields.join(", ")} and try again.` : "Please check the fields and try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

/** The fields the server refused, for marking them in the form. */
export function refusedFields(err: unknown): Set<string> {
  return new Set(isDomainError(err) ? (err.fields ?? []).map((f) => f.field) : []);
}
