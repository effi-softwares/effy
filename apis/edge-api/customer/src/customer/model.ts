import type { CustomerDTO, CustomerStatus } from "@effy/shared-types"

/** The database row. A wire shape — it never leaks past this layer (Principle VI). */
export interface CustomerRow {
  id: string
  cognito_sub: string
  email: string
  given_name: string | null
  family_name: string | null
  status: CustomerStatus
  created_at: Date
  updated_at: Date
}

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
    createdAt: row.created_at.toISOString(),
  }
}
