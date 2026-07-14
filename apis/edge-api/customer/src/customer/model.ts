import type { CustomerDTO, CustomerStatus } from "@effy/shared-types"

/** The database row. A wire shape — it never leaks past this layer (Principle VI). */
export interface CustomerRow {
  id: string
  cognito_sub: string
  email: string
  given_name: string | null
  family_name: string | null
  status: CustomerStatus
  has_password: boolean
  password_updated_at: Date | null
  created_at: Date
  updated_at: Date
}

/**
 * Every column the repository returns. One list, referenced by every query, so a column added to
 * the row type cannot be silently half-added to only some of the statements.
 */
export const CUSTOMER_COLUMNS = `id, cognito_sub, email, given_name, family_name, status,
          has_password, password_updated_at, created_at, updated_at`

/**
 * Row → DTO.
 *
 * ⚠ `cognito_sub` is deliberately NOT in the DTO. It is an internal join key; the storefront has
 * no use for it, and there is no reason to hand a customer's identity provider subject id back
 * out over the wire.
 */
export function toDTO(row: CustomerRow): CustomerDTO {
  return {
    id: row.id,
    email: row.email,
    givenName: row.given_name,
    familyName: row.family_name,
    status: row.status,

    // FR-013 — the ONLY thing the account page may branch on when choosing between "Set a
    // password" and "Change password". Never "how did they sign in": a Google-LINKED customer is an
    // ordinary native user and CAN hold a password (research R5).
    hasPassword: row.has_password,

    // FR-015 — null means NEVER, which is a legitimate, complete, permanent state. Not a gap.
    passwordUpdatedAt: row.password_updated_at?.toISOString() ?? null,

    createdAt: row.created_at.toISOString(),
  }
}
