import type { BackOfficeRole } from "@effy/shared-types";

/**
 * Interface-layer capability check for the order console (least-privilege UX).
 *
 * Reading an order is open to every active back-office role INCLUDING `csa` — triage is a CSA's
 * work, and until 053 they could not see a single order they were being asked about. Only RECORDING
 * a handover or an arrival is admin/manager (spec FR-015).
 *
 * ⚠ THE BACKEND INDEPENDENTLY ENFORCES THIS from the platform record. This only decides which
 * controls the UI reveals, so an operator is never shown a button that will refuse them. It is a
 * courtesy, never the gate — mirrors `features/shops/access.ts` and the shop-mobile manager gate.
 */
export function canRecordOrderProgress(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}
