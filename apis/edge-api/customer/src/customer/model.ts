import type {
  ClosureState,
  CustomerDTO,
  CustomerStatus,
  EmailDeliveryState,
} from "@effy/shared-types"

/** The database row. A wire shape — it never leaks past this layer (Principle VI). */
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

  /**
   * 037 — the platform's conclusion about whether it can reach this customer's address.
   *
   * ⚠ NULL when no outcome has ever been recorded, which is the overwhelmingly common case. Absence
   * of evidence is not evidence of failure, so `toDTO` maps null → "reachable".
   */
  email_delivery: EmailDeliveryState | null
}

/**
 * Every column the repository returns. One list, referenced by every query, so a column added to
 * the row type cannot be silently half-added to only some of the statements.
 */
export const CUSTOMER_COLUMNS = `id, cognito_sub, email, given_name, family_name, phone, status,
          closure_state, has_password, password_updated_at, created_at, updated_at,
          (SELECT s.state FROM public.email_delivery_status s
            WHERE s.address = customer.email) AS email_delivery`

/**
 * ⚠ WHY THE DELIVERY STATE IS A CORRELATED SUBQUERY RATHER THAN A JOIN.
 *
 * This one string is used both as `SELECT … FROM public.customer` and as `RETURNING …` on three
 * UPDATEs and an INSERT. A join can only be written in the first form, so a join would have left the
 * write paths reporting "reachable" for a customer the platform demonstrably cannot reach — a small
 * lie, told on exactly the screen where the truth matters.
 *
 * A subquery works in both, which is what keeps the "one list, referenced by every query" rule above
 * actually true. It is a single indexed lookup on a primary key.
 */

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

    // 034 FR-060 — self-asserted and NEVER verified. FR-060a bars any confirmation indicator on it
    // and bars it from every identity/recovery path; there is no `phoneVerified` companion because a
    // field whose only honest value is `false` eventually gets rendered as a badge by someone.
    phone: row.phone,

    status: row.status,

    // 034 FR-041 — deliberately NOT a third value of `status`. `status` is a platform SANCTION whose
    // safety property is that the customer cannot influence it; closure is the customer's OWN
    // decision. Keeping them apart is what makes "barred AND closing" (FR-049) representable at all.
    closureState: row.closure_state,

    // FR-013 — the ONLY thing the account page may branch on when choosing between "Set a
    // password" and "Change password". Never "how did they sign in": a Google-LINKED customer is an
    // ordinary native user and CAN hold a password (research R5).
    hasPassword: row.has_password,

    // FR-015 — null means NEVER, which is a legitimate, complete, permanent state. Not a gap.
    passwordUpdatedAt: row.password_updated_at?.toISOString() ?? null,

    // 037 FR-030 — whether the platform can actually reach this address.
    //
    // ⚠ AUTHENTICATED SURFACES ONLY. No sign-in screen may branch on this: delivery state is only
    // knowable for an address the platform has emailed, so showing it to whoever typed an address
    // answers "does this address have an Effy account?" — the enumeration oracle 035 spent its
    // phantom-send and timing-parity design closing. The unauthenticated escape hatch is UNIFORM
    // instead (FR-030a).
    //
    // ⚠ null → "reachable": absence of evidence is not evidence of failure, and almost every
    // customer has simply never had an outcome recorded.
    emailDelivery: row.email_delivery ?? "reachable",

    createdAt: row.created_at.toISOString(),
  }
}
