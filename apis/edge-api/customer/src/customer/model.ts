import type {
  ClosureState,
  CustomerDTO,
  CustomerStatus,
  EmailDeliveryState,
} from "@effy/shared-types"

export interface CustomerRow {
  id: string
  cognito_sub: string
  email: string
  given_name: string | null
  family_name: string | null
  phone: string | null
  status: CustomerStatus
  closure_state: ClosureState
  has_password: boolean
  password_updated_at: Date | null
  created_at: Date
  updated_at: Date

  /** Null when no outcome was ever recorded (most customers): read as "reachable". */
  email_delivery: EmailDeliveryState | null
}

/** One column list for every query, so a column cannot be half-added. */
export const CUSTOMER_COLUMNS = `id, cognito_sub, email, given_name, family_name, phone, status,
          closure_state, has_password, password_updated_at, created_at, updated_at,
          (SELECT s.state FROM public.email_delivery_status s
            WHERE s.address = customer.email) AS email_delivery`

/** A correlated subquery, not a join, because the same list is a RETURNING on the writes too. */

/** `cognito_sub` is not in the DTO: an internal key with no use on the wire. */
export function toDTO(row: CustomerRow): CustomerDTO {
  return {
    id: row.id,
    email: row.email,
    givenName: row.given_name,
    familyName: row.family_name,

    // Self-asserted and never verified, so no `phoneVerified` and no use in identity or recovery.
    phone: row.phone,

    status: row.status,

    // Not a third `status` value: status is a sanction the customer cannot influence; closure is their decision.
    closureState: row.closure_state,

    // The only thing deciding "Set a password" vs "Change password"; a Google-linked customer can hold one.
    hasPassword: row.has_password,

    // null means never: a complete state.
    passwordUpdatedAt: row.password_updated_at?.toISOString() ?? null,

    // Authenticated surfaces only: shown on a sign-in screen it would reveal whether an address has an
    // account. null reads as reachable.
    emailDelivery: row.email_delivery ?? "reachable",

    createdAt: row.created_at.toISOString(),
  }
}
