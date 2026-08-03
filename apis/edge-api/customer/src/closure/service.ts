import type {
  ClosureBlockerDTO,
  ClosurePreviewDTO,
  ClosureResultDTO,
  RetainedCategoryDTO,
} from "@effy/shared-types"

import { findByCognitoSub } from "../customer/repo"
import * as cognito from "../password/cognito"
import {
  closeAccount,
  findBlockingOrders,
  findLiveRequest,
  restoreAccount,
  GRACE_PERIOD_DAYS,
  type BlockingOrderRow,
} from "./repo"

/**
 * The account-closure service (034 US3).
 *
 * ⚠ ON THE BARRED CARVE-OUT (FR-049). Every other customer path refuses a barred customer. This one
 * does NOT, deliberately: barring protects the platform FROM the customer; it is not a mechanism for
 * holding their data against their wishes. Refusing here would let a platform sanction silently
 * override a data right. It mirrors `customer-sessions-v1-delete.ts:24`, which already lets a barred
 * customer sign out for the same reason.
 *
 * ⚠ A `closing` customer, by contrast, IS refused everywhere except restore — that is FR-041.
 */

export class ClosureBlockedError extends Error {
  constructor(readonly blockers: ClosureBlockerDTO[]) {
    super("closure is blocked by an active obligation")
    this.name = "ClosureBlockedError"
  }
}

export class ClosureAlreadyRequestedError extends Error {
  constructor() {
    super("a closure request is already live")
    this.name = "ClosureAlreadyRequestedError"
  }
}

export class NoLiveClosureRequestError extends Error {
  constructor() {
    super("no live closure request")
    this.name = "NoLiveClosureRequestError"
  }
}

export class CustomerRecordMissingError extends Error {
  constructor() {
    super("customer record not found")
    this.name = "CustomerRecordMissingError"
  }
}

/**
 * What the platform keeps after erasure, and why (FR-045).
 *
 * ⚠ CARRIED AS DATA, NOT HARDCODED PER SURFACE, so mobile and web cannot drift — and so SC-010 can
 * be checked against one list rather than two renderings.
 *
 * ⚠ THIS LIST NEEDS LEGAL CONFIRMATION BEFORE LAUNCH (spec Assumptions, FR-052a). Apple has demanded
 * that developers cite the specific law behind a retention claim, and SC-010 requires every sentence
 * here to be true of the built system. It is deliberately short: claiming to retain something the
 * platform does not actually keep is as wrong as the reverse.
 */
const RETAINED: RetainedCategoryDTO[] = [
  {
    category: "Completed orders and their receipts",
    reason: "Required for tax and accounting records.",
  },
  {
    category: "Payment records",
    reason: "Required to resolve chargebacks and to meet financial record-keeping obligations.",
  },
  {
    category: "Fraud and security signals",
    reason: "Required to protect the platform and other customers from abuse.",
  },
]

/** Row → DTO for a blocking order (FR-042). */
function toBlockerDTO(row: BlockingOrderRow): ClosureBlockerDTO {
  const awaitingPayment = row.status === "pending_payment"
  return {
    kind: awaitingPayment ? "order_awaiting_payment" : "order_in_transit",
    reference: row.order_number,

    // Web routes on `href`, mobile on `target` — mobile has no URL router, which is why the closed
    // vocabulary exists. BOTH are derived from the same order id so they cannot disagree (029).
    href: `/orders/${row.id}`,
    target: { kind: "order", id: row.id },

    clearsAt: row.clears_at.toISOString(),

    // Awaiting payment is the customer's to resolve — complete or abandon the checkout. An order in
    // transit is not, and that is ACCEPTABLE: FR-042 requires a blocker to be resolvable OR to
    // self-clear within a short stated period, not to be resolvable outright. What it forbids is a
    // block with no end, which `clearsAt` structurally prevents.
    resolvableByShopper: awaitingPayment,
  }
}

/** Everything the customer must see before any irreversible step (FR-040). Side-effect free. */
export async function previewClosure(cognitoSub: string): Promise<ClosurePreviewDTO> {
  const customer = await findByCognitoSub(cognitoSub)
  if (!customer) throw new CustomerRecordMissingError()

  const [orders, live] = await Promise.all([
    findBlockingOrders(customer.id),
    findLiveRequest(customer.id),
  ])

  const eraseAfterIfRequestedNow = new Date(
    Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  return {
    blockers: orders.map(toBlockerDTO),
    retained: RETAINED,
    eraseAfterIfRequestedNow,
    activeRequest: live
      ? {
          requestedAt: live.requested_at.toISOString(),
          eraseAfter: live.erase_after.toISOString(),
        }
      : null,
  }
}

/**
 * Issue the step-up code that FR-043 requires (US3 acceptance 4).
 *
 * ⚠ REUSES 012's TOKEN-AUTHORIZED PRIMITIVE, AND THAT CHOICE IS THE WHOLE REASON THIS WORKS FOR
 * EVERY CUSTOMER. It is keyed on the account's VERIFIED EMAIL ATTRIBUTE, not on a password — so a
 * Google-only customer, who has no password to be prompted for, can complete it exactly like anyone
 * else. A password re-auth prompt here would be an unresolvable dead end for that whole cohort, and
 * therefore "unnecessarily difficult" in Apple's terms.
 *
 * It also needs NO new IAM: the call relays the customer's own authority via their access token.
 *
 * ⚠ Refuses while blockers exist. There is no point putting a code in someone's inbox for a request
 * that cannot succeed — and doing so would teach customers to ignore the refusal.
 */
export async function sendClosureChallenge(
  cognitoSub: string,
  accessToken: string,
): Promise<{ maskedDestination: string }> {
  const customer = await findByCognitoSub(cognitoSub)
  if (!customer) throw new CustomerRecordMissingError()

  if (customer.closure_state === "closing") throw new ClosureAlreadyRequestedError()

  const orders = await findBlockingOrders(customer.id)
  if (orders.length > 0) throw new ClosureBlockedError(orders.map(toBlockerDTO))

  const destination = await cognito.sendEmailVerificationCode(accessToken)
  return { maskedDestination: destination ?? mask(customer.email) }
}

/**
 * Verify the code and close the account.
 *
 * ⚠⚠ THE ORDER HERE IS THE SECURITY OF THE FEATURE, and it mirrors 012's password write. ⚠⚠
 *
 * The code is verified BEFORE anything is written. A session that cannot produce a valid code never
 * reaches the closure. That is what makes FR-043 real rather than decorative — a stolen token alone
 * must not be able to delete somebody's account.
 *
 * ⚠ AND THE BLOCKERS ARE RE-EVALUATED HERE, not trusted from the preview. An order can be placed
 * between the customer seeing the preview and confirming, and a closure that slipped through would
 * strand a paid order against an account that no longer exists.
 */
export async function requestClosure(
  cognitoSub: string,
  accessToken: string,
  code: string,
): Promise<ClosureResultDTO> {
  const customer = await findByCognitoSub(cognitoSub)
  if (!customer) throw new CustomerRecordMissingError()

  if (customer.closure_state === "closing") throw new ClosureAlreadyRequestedError()

  const orders = await findBlockingOrders(customer.id)
  if (orders.length > 0) throw new ClosureBlockedError(orders.map(toBlockerDTO))

  // Throws CodeMismatchException / ExpiredCodeException — mapped to 400 by the handler.
  await cognito.verifyEmailCode(accessToken, code)

  const { eraseAfter } = await closeAccount({
    customerId: customer.id,
    cognitoSub,
    verificationMethod: "email_code",
  })

  // FR-041 — every session ends, including this one. Token-authorized, so no new IAM.
  await cognito.globalSignOut(accessToken)

  return { eraseAfter: eraseAfter.toISOString(), allSessionsRevoked: true }
}

/** `janith@example.com` → `j•••@example.com`. Never the full address. */
function mask(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return "your email"
  return `${local.slice(0, 1)}•••@${domain}`
}

/**
 * Cancel a live closure request (FR-041a).
 *
 * ⚠ EXPLICIT BY DESIGN. Signing in surfaces the choice; it does not make it. See `restoreAccount`.
 */
export async function restoreClosure(cognitoSub: string): Promise<{ restoredAt: string }> {
  const customer = await findByCognitoSub(cognitoSub)
  if (!customer) throw new CustomerRecordMissingError()

  const row = await restoreAccount({ customerId: customer.id, cognitoSub })
  if (!row) throw new NoLiveClosureRequestError()

  return { restoredAt: new Date().toISOString() }
}
