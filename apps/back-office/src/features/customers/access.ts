import type { BackOfficeRole } from "@effy/shared-types"

export const canDebitPoints = (roles: readonly BackOfficeRole[]) => roles.includes("admin") || roles.includes("manager")
export const canEditPointsSettings = (roles: readonly BackOfficeRole[]) => roles.includes("admin")
export const creditIsLimited = (roles: readonly BackOfficeRole[]) => !canDebitPoints(roles)
