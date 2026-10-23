import type { BackOfficeRole } from "@effy/shared-types";

/**
 * Who may decide a review item or set a margin.
 *
 * A courtesy, never the gate. This hides controls a csa cannot use; `edge-catalog` decides from
 * the `admin.staff` record on every request and refuses regardless of what this returns.
 */
export function canDecideReview(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}
