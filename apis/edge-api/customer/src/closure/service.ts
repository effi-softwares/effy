import type {
  ClosureBlockerDTO,
  ClosurePreviewDTO,
  ClosureResultDTO,
} from "@effy/shared-types"

import { abandonOrder, stripeGateway, type AbandonDeps } from "@effy/edge-shared/payments"

import { findByCognitoSub } from "../customer/repo"
import * as cognito from "../password/cognito"
import {
  closeAccount,
  findBlockingOrders,
  findLiveRequest,
  findPointsHeld,
  findUnpaidOrders,
  restoreAccount,
  GRACE_PERIOD_DAYS,
  type BlockingOrderRow,
} from "./repo"
import { RETAINED } from "./retained"

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

/** 113: an unpaid order's payment is going through (or couldn't be checked): nothing is closed. */
export class PaymentInProgressError extends Error {
  constructor(readonly orderNumber: string) {
    super("a payment for an unpaid order is in progress")
    this.name = "PaymentInProgressError"
  }
}

/** 113 FR-009: the date the customer was told has passed; the account can't be restored. */
export class ClosureFinalError extends Error {
  constructor(readonly eraseAfter: Date) {
    super("the closure is final")
    this.name = "ClosureFinalError"
  }
}

export class CustomerRecordMissingError extends Error {
  constructor() {
    super("customer record not found")
    this.name = "CustomerRecordMissingError"
  }
}

/** Only a paid order on its way blocks (113): it clears itself by `clearsAt`. */
function toBlockerDTO(row: BlockingOrderRow): ClosureBlockerDTO {
  return {
    kind: "order_in_transit",
    reference: row.order_number,

    // Web routes on `href`, mobile on `target`, both from the order id.
    href: `/orders/${row.id}`,
    target: { kind: "order", id: row.id },

    clearsAt: row.clears_at.toISOString(),
  }
}

/**
 * 113 FR-007: closes the customer's unpaid checkouts before the account. The provider is asked first (abandonOrder);
 * anything but "closed" refuses closure with the order's number. No `settlePaid`: a payment that went through just
 * now is placed by the webhook, through commerce, and is then a paid order (one implementation, research R5).
 */
export async function abandonUnpaidOrders(
  customerId: string,
  deps: Pick<AbandonDeps, "gateway"> = { gateway: stripeGateway },
): Promise<void> {
  for (const o of await findUnpaidOrders(customerId)) {
    const { result } = await abandonOrder({ gateway: deps.gateway }, o.id)
    if (result === "abandoned" || result === "gone") continue
    throw new PaymentInProgressError(o.order_number)
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

  // 113: unpaid checkouts close with the account. A payment going through refuses closure (nothing is closed).
  await abandonUnpaidOrders(customer.id)

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
  if (!row) {
    // 113 FR-009: a live request past its date is final, not "nothing to restore".
    const live = await findLiveRequest(customer.id)
    if (live && live.erase_after.getTime() <= Date.now()) throw new ClosureFinalError(live.erase_after)
    throw new NoLiveClosureRequestError()
  }

  return { restoredAt: new Date().toISOString() }
}
