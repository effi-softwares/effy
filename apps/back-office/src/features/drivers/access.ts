import type { BackOfficeRole } from "@effy/shared-types";

/**
 * Interface-layer capability check for the driver console (least-privilege UX).
 *
 * READING is open to every active back-office role INCLUDING `csa` (FR-022) — a CSA is exactly who
 * is asked "why did my delivery fail", and until this feature nobody at Effy could answer it. That
 * covers the register, the profile, duty, exceptions, history and the change trail.
 *
 * MUTATING is admin/manager (FR-023). A driver record is a credential; creating, editing or standing
 * one down is an action whose blast radius leaves the console — the same gate 037's deliverability
 * repair and 046's outward reply carry.
 *
 * ⚠ THE BACKEND ENFORCES THIS INDEPENDENTLY from the `admin.staff` record. This only decides which
 * controls the UI reveals, so an operator is never shown a button that will refuse them. It is a
 * courtesy, never the gate.
 */
export function canManageDrivers(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}
