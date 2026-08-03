import type { CustomerDTO } from "@effy/shared-types"

import { toDTO, type CustomerRow } from "./model"
import { updateProfile, upsertCustomer } from "./repo"

/** A barred customer. Distinguished from every other failure so the handler can answer 403. */
export class CustomerBarredError extends Error {
  constructor() {
    super("customer is barred")
    this.name = "CustomerBarredError"
  }
}

/**
 * A customer who has asked to be deleted and is inside the grace window (034 FR-041).
 *
 * A DISTINCT error from `CustomerBarredError`, even though both currently answer 403 with the same
 * uniform body. They are different facts about different things — one is a sanction the platform
 * imposed, the other is a decision the customer made — and collapsing them would make the closure
 * flow's own 409s indistinguishable from a ban in the logs.
 */
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

  // 034 FR-041 — a customer inside the closure grace window is refused everywhere, with exactly ONE
  // exception: the explicit restore call, which does not come through here.
  //
  // ⚠ THE CLOSURE FLOW ITSELF MUST NOT CALL THIS. `previewClosure` / `requestClosure` /
  // `restoreClosure` read the record directly via `findByCognitoSub` precisely so this gate cannot
  // refuse the very requests that manage closure — and so a BARRED customer can still exercise the
  // deletion right (FR-049), which this function would otherwise deny.
  if (row.closure_state === "closing") throw new CustomerClosingError()
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
  givenName: string | null
  familyName: string | null
  /**
   * The registration-route hint (012 FR-013). Applied ONLY when this call CREATES the record.
   *
   * Cognito cannot be asked whether a user has a password, so the platform must seed the answer at
   * registration from what the sign-up form declares. It is client-asserted and therefore untrusted
   * — and safe, because lying in either direction grants no capability the inbox-holder did not
   * already have. The full argument lives on `upsertCustomer`; read it before touching this.
   */
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

/** The customer maintains what is theirs to change (FR-026, + `phone` per 034 FR-060) — only that. */
export async function updateCustomerProfile(
  cognitoSub: string,
  input: { givenName: string | null; familyName: string | null; phone: string | null },
): Promise<CustomerDTO> {
  const row = await updateProfile(cognitoSub, input.givenName, input.familyName, normalizePhone(input.phone))
  if (!row) throw new CustomerNotFoundError()

  // A barred — or closing — customer may not edit their profile either.
  assertActive(row)
  return toDTO(row)
}

/**
 * Trim, bound, and treat empty as absent (034 FR-060).
 *
 * ⚠ NO FORMAT VALIDATION, deliberately. The value is unverified and non-authoritative (FR-060a), so
 * a strict pattern would be a support burden that buys nothing — and Effy has no reason yet to
 * assume a single national format. It is stored as entered.
 *
 * The length bound exists only to stop an unbounded write, matching how the name parts are handled.
 */
const MAX_PHONE = 32

function normalizePhone(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (trimmed === "") return null
  return trimmed.slice(0, MAX_PHONE)
}
