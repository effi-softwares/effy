import { isDomainError } from "@effy/api-client"
import { ACCESS_ENDED_TYPES, type AccessEndedType, type TeamRefusal } from "@effy/shared-types"

/** Settings › Team and access is for Administrators (119 FR-002). */
export function canManageTeam(roles: readonly string[]): boolean {
  return roles.includes("admin")
}

/** The machine word of a problem type URI (`…/problems/not-on-team` → `not_on_team`). */
export function problemWord(err: unknown): string | null {
  if (!isDomainError(err) || !err.type) return null
  const m = /\/problems\/([a-z0-9-]+)$/.exec(err.type)
  return m ? m[1]!.replaceAll("-", "_") : null
}

/** A 403 that means this browser's back-office access has ended (research R8): sign it out. */
export function isAccessEnded(err: unknown): boolean {
  return isDomainError(err) && err.status === 403 && (ACCESS_ENDED_TYPES as readonly string[]).includes(problemWord(err) ?? "")
}

export type { AccessEndedType }

/** A team refusal's word, when the error is one. */
export function teamRefusal(err: unknown): TeamRefusal | null {
  return (problemWord(err) as TeamRefusal | null) ?? null
}
