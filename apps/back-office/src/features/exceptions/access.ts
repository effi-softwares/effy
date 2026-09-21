import type { BackOfficeRole } from "@effy/shared-types";

/**
 * Who may CLOSE a delivery exception (064, FR-021).
 *
 * ⚠ THE READ IS OPEN TO EVERYONE, INCLUDING csa — deliberately, and it is the point of the whole
 * capability. 056 found the driver app had been recording exceptions "for a reader that does not
 * exist": a drop was marked undeliverable, the package stayed put, and the shopper kept seeing "on
 * the way" with nobody at Effy told. A CSA is precisely who is asked "where is my order", so gating
 * the READ behind a manager would rebuild the gap in a smaller form.
 *
 * Closing one is different: it asserts something about the physical world no query can verify, and
 * it takes the item off the list everyone else is working from.
 *
 * ⚠ A COURTESY, NOT THE DECISION. The gate that matters is `guard(…, "mutate")` in `edge-fleet`,
 * per route, behind the back-office authorizer. This file must never be the only check.
 */
export function canResolveExceptions(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}
