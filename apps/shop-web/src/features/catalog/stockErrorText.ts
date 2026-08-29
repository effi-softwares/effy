import { isDomainError } from "@effy/api-client";

/**
 * Console copy for a stock refusal (054).
 *
 * ⚠ TWO RULES PULL AGAINST EACH OTHER HERE, AND BOTH ARE KEPT.
 *
 * The first is the platform's: NEVER render the server's `detail` verbatim. It is free-form prose
 * that can leak internals, and `errorText.ts` beside this file has followed that rule since 016.
 *
 * The second is 053's lesson: a refusal that collapses to "Something went wrong" throws away the
 * named reason the server went to the trouble of producing, and the operator is left guessing. 053
 * shipped exactly that on the order console — the screen tested `e instanceof Error` while the api
 * client throws a PLAIN OBJECT, so every refusal became one generic sentence.
 *
 * The resolution is to key off STRUCTURE, not prose: `kind`, `status`, and the `field` names in the
 * problem body — all of them contract, none of them free text — and map each to our own copy.
 *
 * ⚠ That only works because 054 fixed `toDomainError`, which read `problem.fields` while the wire
 * carries `errors`. `DomainError.fields` was undefined on every refusal platform-wide until then.
 */
export function stockErrorText(err: unknown): string {
  if (!isDomainError(err)) return "Something went wrong. Please try again.";

  const field = err.fields?.[0]?.field;
  if (err.status === 400 || err.status === 422) {
    switch (field) {
      case "onHand":
        return "Enter a whole number of units, zero or more.";
      case "delta":
        return "Enter a whole number to add or remove. It cannot be zero.";
      case "threshold":
      case "defaultThreshold":
        return "Enter a whole number, or leave it blank to use the shop default.";
      case "reason":
        return "Choose a reason for this change.";
      case "tracked":
        return "Choose whether to track stock for this product.";
      default:
        return "Please check the values and try again.";
    }
  }

  if (err.status === 409) {
    return "Stock is not being tracked for this product. Turn tracking on first.";
  }
  if (err.kind === "forbidden") {
    // ⚠ Covers "another shop's product" too — the server answers both with the same 403 so the route
    // cannot be used to discover which product ids exist (FR-004). The copy must not out-guess it.
    return "You don't have permission to change stock for this product.";
  }
  if (err.kind === "not-found") return "That product no longer exists.";
  if (err.kind === "unavailable") {
    return "The service is waking up or unreachable. Try again in a moment.";
  }
  return "Something went wrong. Please try again.";
}
