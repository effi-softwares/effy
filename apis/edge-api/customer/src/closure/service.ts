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
  findPointsHeld,
  restoreAccount,
  GRACE_PERIOD_DAYS,
  type BlockingOrderRow,
} from "./repo"

/**
 * A barred customer may still close their account (barring protects the platform, it does not hold
 * their data), as they may still sign out. A `closing` customer is refused everywhere except restore.
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
 * What is kept after erasure, and why: one list for mobile and web. Needs legal confirmation before
 * launch, and every sentence must be true of the system. Keep the verb "DELETE"
 * (`deletion-copy.test.ts` checks).
 */
const RETAINED: RetainedCategoryDTO[] = [
  {
    category: "Your orders and receipts",
    reason:
      "Tax and accounting rules require us to keep a record of every completed sale, even after you delete your account.",
  },
  {
    category: "Your payment records",
    reason:
      "Financial rules require us to hold on to proof of payments and refunds. It is also what lets us help you if a payment is ever disputed.",
  },
  {
    category: "Security and fraud checks",
    reason:
      "A small amount of security information stays with us so we can keep Effy safe for everyone who shops here.",
  },
]

function toBlockerDTO(row: BlockingOrderRow): ClosureBlockerDTO {
  const awaitingPayment = row.status === "pending_payment"
  return {
    kind: awaitingPayment ? "order_awaiting_payment" : "order_in_transit",
    reference: row.order_number,

    // Web routes on `href`, mobile on `target`, both from the order id.
    href: `/orders/${row.id}`,
    target: { kind: "order", id: row.id },

    clearsAt: row.clears_at.toISOString(),

    // Awaiting payment is the customer's to resolve; in transit clears itself by `clearsAt`.
    resolvableByShopper: awaitingPayment,
  }
}

/** Everything the customer must see before any irreversible step. Side-effect free. */
export async function previewClosure(cognitoSub: string): Promise<ClosurePreviewDTO> {
  const customer = await findByCognitoSub(cognitoSub)
  if (!customer) throw new CustomerRecordMissingError()

  const [orders, live, points] = await Promise.all([
    findBlockingOrders(customer.id),
    findLiveRequest(customer.id),
    // Best-effort: a failed points read leaves the fields absent, never a false "0".
    findPointsHeld(customer.id).catch(() => null),
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
    ...(points && points.points > 0
      ? { pointsHeld: points.points, pointsValueAmount: (points.valueCents / 100).toFixed(2) }
      : {}),
  }
}

/**
 * The step-up code, keyed on the verified email attribute rather than a password, so a Google-only
 * customer can complete it; no new IAM (the customer's own access token). Refused while blockers exist.
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

/** The code is verified before anything is written, and the blockers are re-evaluated here. */
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

  // Throws CodeMismatchException / ExpiredCodeException (400 in the handler).
  await cognito.verifyEmailCode(accessToken, code)

  const { eraseAfter } = await closeAccount({
    customerId: customer.id,
    cognitoSub,
    verificationMethod: "email_code",
  })

  // Every session ends, including this one. Token-authorized, so no new IAM.
  await cognito.globalSignOut(accessToken)

  return { eraseAfter: eraseAfter.toISOString(), allSessionsRevoked: true }
}

/** `janith@example.com` → `j•••@example.com`. */
function mask(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return "your email"
  return `${local.slice(0, 1)}•••@${domain}`
}

/** Explicit by design: signing in surfaces the choice, it does not make it. */
export async function restoreClosure(cognitoSub: string): Promise<{ restoredAt: string }> {
  const customer = await findByCognitoSub(cognitoSub)
  if (!customer) throw new CustomerRecordMissingError()

  const row = await restoreAccount({ customerId: customer.id, cognitoSub })
  if (!row) throw new NoLiveClosureRequestError()

  return { restoredAt: new Date().toISOString() }
}
