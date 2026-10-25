import type { BackOfficeRole } from "@effy/shared-types"

export interface Identity {
  subject: string
  email: string
  roles: BackOfficeRole[]
}

export type Session = { status: "signed-in"; identity: Identity } | { status: "signed-out" }

export function isAdmin(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin")
}
