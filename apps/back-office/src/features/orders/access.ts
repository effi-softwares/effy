import type { BackOfficeRole } from "@effy/shared-types";

/**
 * Capability check for the order console. Reading is open to every role including `csa` (triage);
 * recording a hand-over or an arrival is admin/manager. The backend enforces it; this only decides which
 * controls are shown.
 */
export function canRecordOrderProgress(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}
