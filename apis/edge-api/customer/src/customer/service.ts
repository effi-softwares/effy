import type { CustomerDTO } from "@effy/shared-types"

import { toDTO, type CustomerRow } from "./model"
import { updateDisplayName, upsertCustomer } from "./repo"

/** A barred customer. Distinguished from every other failure so the handler can answer 403. */
export class CustomerBarredError extends Error {
  constructor() {
    super("customer is barred")
    this.name = "CustomerBarredError"
  }
}

export class CustomerNotFoundError extends Error {
  constructor() {
    super("customer not found")
    this.name = "CustomerNotFoundError"
  }
}

/**
 * THE ACCESS DECISION (FR-025, SC-011).
 *
 * A valid credential is NOT sufficient. The gateway's JWT authorizer has already proved the token
 * is genuine, unexpired, and minted by the customer pool — and that is where most systems stop,
 * which is precisely why most systems cannot ban anybody.
 *
 * The platform's own record decides. A customer marked `barred` is refused while holding a
 * perfectly valid token. The claim is the ORIGIN of identity; the record is the AUTHORITY on
 * access.
 */
function assertActive(row: CustomerRow): void {
  if (row.status !== "active") throw new CustomerBarredError()
}

/**
 * The record-backed identity read, with just-in-time creation (FR-023/FR-024).
 *
 * ⚠ Note the ORDER: the record is upserted FIRST, and only then is the ban checked. A barred
 * customer still HAS a record — we simply refuse to serve them. Checking before upserting would
 * mean a first-time visitor has nothing to check against, and would either crash or admit them.
 */
export async function getOrCreateCustomer(identity: {
  sub: string
  email: string
  name: string | null
}): Promise<CustomerDTO> {
  const row = await upsertCustomer({
    cognitoSub: identity.sub,
    email: identity.email,
    displayName: identity.name,
  })

  assertActive(row)
  return toDTO(row)
}

/** The customer maintains what is theirs to change (FR-026) — and only that. */
export async function updateCustomerProfile(
  cognitoSub: string,
  input: { displayName: string | null },
): Promise<CustomerDTO> {
  const row = await updateDisplayName(cognitoSub, input.displayName)
  if (!row) throw new CustomerNotFoundError()

  // A barred customer may not edit their profile either.
  assertActive(row)
  return toDTO(row)
}
