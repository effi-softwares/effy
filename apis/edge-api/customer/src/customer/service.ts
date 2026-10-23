import type { CustomerDTO } from "@effy/shared-types"

import { toDTO, type CustomerRow } from "./model"
import { updateProfile, upsertCustomer } from "./repo"

/** Distinguished so the handler can answer 403. */
export class CustomerBarredError extends Error {
  constructor() {
    super("customer is barred")
    this.name = "CustomerBarredError"
  }
}

/** Inside the closure grace window. Same 403 as barred, but a different fact, kept apart in the logs. */
export class CustomerClosingError extends Error {
  constructor() {
    super("customer account is closing")
    this.name = "CustomerClosingError"
  }
}

export class CustomerNotFoundError extends Error {
  constructor() {
    super("customer not found")
    this.name = "CustomerNotFoundError"
  }
}

/** The access decision: a valid token is not sufficient, the record decides (a barred customer is refused). */
function assertActive(row: CustomerRow): void {
  if (row.status !== "active") throw new CustomerBarredError()

  // A closing customer is refused everywhere but the explicit restore. The closure flow reads the record
  // directly, so this gate cannot refuse it and a barred customer can still delete.
  if (row.closure_state === "closing") throw new CustomerClosingError()
}

/** Upserts first, then checks the ban: a barred customer still has a record. */
export async function getOrCreateCustomer(identity: {
  sub: string
  email: string
  givenName: string | null
  familyName: string | null
  /** The registration route's hint, applied only on create (see `upsertCustomer`). */
  seedHasPassword?: boolean
}): Promise<CustomerDTO> {
  const row = await upsertCustomer({
    cognitoSub: identity.sub,
    email: identity.email,
    givenName: identity.givenName,
    familyName: identity.familyName,
    seedHasPassword: identity.seedHasPassword,
  })

  assertActive(row)
  return toDTO(row)
}

/** Only what is the customer's to change. */
export async function updateCustomerProfile(
  cognitoSub: string,
  input: { givenName: string | null; familyName: string | null; phone: string | null },
): Promise<CustomerDTO> {
  const row = await updateProfile(cognitoSub, input.givenName, input.familyName, normalizePhone(input.phone))
  if (!row) throw new CustomerNotFoundError()

  // Barred or closing customers may not edit their profile.
  assertActive(row)
  return toDTO(row)
}

/** Trim, bound, empty as absent. No format check: it is unverified and stored as entered. */
const MAX_PHONE = 32

function normalizePhone(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (trimmed === "") return null
  return trimmed.slice(0, MAX_PHONE)
}
