import { isDomainError } from "@effy/api-client";

import type { ExclusionReasonDTO } from "@effy/shared-types";

import { REASON_TEXT } from "./model";

/**
 * Uniform, non-leaking failure copy for the dispatcher console (063).
 *
 * ⚠ TWO RULES, AND THE SECOND IS THE ONE THAT IS EASY TO GET WRONG:
 *
 *   1. `@effy/api-client` throws a `DomainError` — a PLAIN OBJECT, not an `Error` instance. Testing
 *      `e instanceof Error` is always false, which is how 053's order console threw away every
 *      refusal the server had got right, with a fully green suite.
 *   2. `detail` is not rendered verbatim as a rule (005 FR-008). It IS rendered for an ineligible
 *      driver, because only the service knows WHICH condition failed — and a generic "not allowed"
 *      sends the operator hunting through five screens for which of five things is wrong. That is
 *      the whole of FR-034.
 *
 * ⚠ `DomainError.fields` IS POPULATED AND MUST BE. The wire key is `errors`, not `fields`; 054 found
 * `toDomainError` reading only `fields`, so the field list was `undefined` on EVERY refusal on EVERY
 * surface since the type existed. It reads both now — and this console depends on it, so the test
 * beside this file asserts the named reasons actually arrive.
 */

export type DispatchAction = "reassign" | "unassign" | "reorder" | "lock" | "unlock";

const FORBIDDEN: Record<DispatchAction, string> = {
  reassign: "You do not have permission to move a round to another driver.",
  unassign: "You do not have permission to take work back from a driver.",
  reorder: "You do not have permission to change a round's order.",
  lock: "You do not have permission to lock an assignment.",
  unlock: "You do not have permission to release a lock.",
};

const STALE: Record<DispatchAction, string> = {
  reassign: "Somebody else changed this round while you were looking at it. Reload and try again.",
  unassign: "Somebody else changed this round while you were looking at it. Reload and try again.",
  reorder: "Somebody else changed this round while you were looking at it. Reload and try again.",
  lock: "Somebody else changed this round while you were looking at it. Reload and try again.",
  unlock: "Somebody else changed this round while you were looking at it. Reload and try again.",
};

export function dispatchActionError(err: unknown, action: DispatchAction): string {
  if (!isDomainError(err)) {
    return "Something went wrong. Nothing was changed — try again.";
  }

  if (err.status === 403) return FORBIDDEN[action];
  if (err.status === 404) return "That round no longer exists. It may have been replanned since this page loaded.";
  if (err.status === 409) return STALE[action];

  // ⚠ 422 IS THE ONE THAT MUST SAY WHY (FR-034). A dispatcher may override a preference; they may
  // not override an unlicensed driver, and they need to know which it was. The sentence is built
  // from the CODES the contract defines, never from the server's prose — see `refusalReasons`.
  if (err.status === 422) {
    const named = refusalReasons(err);
    if (named.length > 0) {
      return `That driver cannot take this round: ${named.join("; ").toLowerCase()}.`;
    }
  }

  return "That change could not be made. Nothing was altered.";
}

/**
 * The conditions the server named, in THIS console's words.
 *
 * ⚠ MAPPED FROM `field`, NEVER RENDERED FROM `message`. For a whole-request refusal `field`
 * carries a STABLE MACHINE-READABLE CODE — 032's convention, which `ProblemFieldIssue` documents. `DomainError`'s own doc says it outright:
 * surfacing a field is not the same as showing raw `detail`, because a `code` is a value the API
 * contract defines on purpose while `message` is server prose that can leak internals (005 FR-008).
 * The first draft of this file rendered `f.message` verbatim — the existing comment warns against
 * exactly that, three lines above where I was reading.
 *
 * ⚠ An unrecognised code is DROPPED rather than shown raw. A new reason with no wording here is a
 * contract change somebody must make deliberately; printing `no_refrigeration` at an operator is
 * worse than printing nothing, and the model's exhaustiveness test fails the moment one is missing.
 */
export function refusalReasons(err: unknown): string[] {
  if (!isDomainError(err)) return [];
  return (err.fields ?? [])
    .map((f) => REASON_TEXT[f.field as ExclusionReasonDTO])
    .filter((m): m is string => typeof m === "string" && m !== "");
}
