import type { ShopRole } from "@effy/shared-types"

export interface Identity {
  subject: string
  email: string
  roles: ShopRole[]
}

export type Session = { status: "signed-in"; identity: Identity } | { status: "signed-out" }
