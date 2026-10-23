import type { BackOfficeRole } from "@effy/shared-types";

/**
 * Which points controls each role is shown. A courtesy, never the gate: the orders service
 * decides every one of these again from the staff record.
 *
 *  · credit — every role, csa included: making things right is a csa's job. A csa is held to the
 *  per-credit limit by the server.
 *  · debit — admin, manager.
 *  · settings — admin only.
 */
export const canDebitPoints = (roles: readonly BackOfficeRole[]) => roles.includes("admin") || roles.includes("manager");
export const canEditPointsSettings = (roles: readonly BackOfficeRole[]) => roles.includes("admin");
/** A csa's credit is limited; admin and manager are not. */
export const creditIsLimited = (roles: readonly BackOfficeRole[]) => !canDebitPoints(roles);
