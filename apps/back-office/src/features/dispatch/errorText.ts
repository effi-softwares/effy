import { isDomainError } from "@effy/api-client";

import type { ExclusionReasonDTO } from "@effy/shared-types";

import { REASON_TEXT } from "./model";

/**
 * Failure copy for the dispatcher console.
 *  1. `@effy/api-client` throws a `DomainError`, a plain object: `e instanceof Error` is always false.
 *  2. `detail` is not rendered, except for an ineligible driver, where only the service knows which
 *  condition failed.
 * `DomainError.fields` (the wire's `errors`) carries the named reasons; the test beside this asserts they
 * arrive.
 */

export type DispatchAction = "reassign" | "unassign" | "reorder";

const FORBIDDEN: Record<DispatchAction, string> = {
  reassign: "You do not have permission to move a round to another driver.",
  unassign: "You do not have permission to take work back from a driver.",
  reorder: "You do not have permission to change a round's order.",
};

const STALE: Record<DispatchAction, string> = {
  reassign: "Somebody else changed this round while you were looking at it. Reload and try again.",
  unassign: "Somebody else changed this round while you were looking at it. Reload and try again.",
  reorder: "Somebody else changed this round while you were looking at it. Reload and try again.",
};

export function dispatchActionError(err: unknown, action: DispatchAction): string {
  if (!isDomainError(err)) {
    return "Something went wrong. Nothing was changed — try again.";
  }

  if (err.status === 403) return FORBIDDEN[action];
  if (err.status === 404) return "That round no longer exists. It may have been replanned since this page loaded.";
  if (err.status === 409) return STALE[action];

  // 422 is the one that must say why. A dispatcher may override a preference; they may
  // not override an unlicensed driver, and they need to know which it was. The sentence is built
  // from the codes the contract defines, never from the server's prose — see `refusalReasons`.
  if (err.status === 422) {
    const named = refusalReasons(err);
    if (named.length > 0) {
      return `That driver cannot take this round: ${named.join("; ").toLowerCase()}.`;
    }
  }

  return "That change could not be made. Nothing was altered.";
}

/**
 * The conditions the server named, in this console's words: mapped from `field` (a stable code the
 * contract defines), never from `message` (server prose). An unrecognised code is dropped rather than shown
 * raw; the model's exhaustiveness test fails when one has no wording.
 */
export function refusalReasons(err: unknown): string[] {
  if (!isDomainError(err)) return [];
  return (err.fields ?? [])
    .map((f) => REASON_TEXT[f.field as ExclusionReasonDTO])
    .filter((m): m is string => typeof m === "string" && m !== "");
}
