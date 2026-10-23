import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../customer/repo", () => ({ findByCognitoSub: vi.fn() }))
vi.mock("./repo", async () => {
  const actual = await vi.importActual<typeof import("./repo")>("./repo")
  return {
    // The real constants, so the tests cannot agree with a stubbed window.
    GRACE_PERIOD_DAYS: actual.GRACE_PERIOD_DAYS,
    IN_TRANSIT_BLOCK_DAYS: actual.IN_TRANSIT_BLOCK_DAYS,
    findBlockingOrders: vi.fn(),
    findLiveRequest: vi.fn(),
    findPointsHeld: vi.fn(async () => ({ points: 0, valueCents: 0 })),
    closeAccount: vi.fn(),
    restoreAccount: vi.fn(),
  }
})
vi.mock("../password/cognito", () => ({
  sendEmailVerificationCode: vi.fn(),
  verifyEmailCode: vi.fn(),
  globalSignOut: vi.fn(),
}))

import { findByCognitoSub } from "../customer/repo"
import * as cognito from "../password/cognito"
import {
  ClosureAlreadyRequestedError,
  ClosureBlockedError,
  NoLiveClosureRequestError,
  previewClosure,
  requestClosure,
  restoreClosure,
  sendClosureChallenge,
} from "./service"
import {
  closeAccount,
  findBlockingOrders,
  findLiveRequest,
  findPointsHeld,
  restoreAccount,
  GRACE_PERIOD_DAYS,
  IN_TRANSIT_BLOCK_DAYS,
  type BlockingOrderRow,
} from "./repo"

import type { CustomerRow } from "../customer/model"

const customer = (over: Partial<CustomerRow> = {}): CustomerRow =>
  ({
    id: "c-1",
    cognito_sub: "sub-1",
    email: "shopper@example.com",
    given_name: "Janith",
    family_name: "Madarasinghe",
    phone: null,
    status: "active",
    closure_state: "open",
    has_password: false,
    password_updated_at: null,
    created_at: new Date("2026-07-14T00:00:00Z"),
    updated_at: new Date("2026-07-14T00:00:00Z"),
    ...over,
  }) as CustomerRow

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

const blockingOrder = (over: Partial<BlockingOrderRow> = {}): BlockingOrderRow => ({
  id: "o-1",
  order_number: "EFY-HVX2AE",
  status: "paid",
  created_at: daysAgo(1),
  clears_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
  ...over,
})

beforeEach(() => {
  // `clearAllMocks` keeps implementations, so the defaults are re-stated for each test.
  vi.clearAllMocks()
  vi.mocked(findLiveRequest).mockResolvedValue(null)
  vi.mocked(findBlockingOrders).mockResolvedValue([])
  vi.mocked(cognito.verifyEmailCode).mockResolvedValue(undefined)
  vi.mocked(cognito.globalSignOut).mockResolvedValue(undefined)
  vi.mocked(cognito.sendEmailVerificationCode).mockResolvedValue("s•••@example.com")
})

describe("the two windows are NOT the same number", () => {
  /** The grace period (30d) and the order block (7d) answer different questions and must not be equal. */
  it("keeps the order block SHORTER than the grace period", () => {
    expect(IN_TRANSIT_BLOCK_DAYS).toBeLessThan(GRACE_PERIOD_DAYS)
    expect(IN_TRANSIT_BLOCK_DAYS).toBe(7)
    expect(GRACE_PERIOD_DAYS).toBe(30)
  })
})

describe("previewClosure", () => {
  it("reports no blockers for a customer with nothing in flight", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer())

    const preview = await previewClosure("sub-1")

    expect(preview.blockers).toEqual([])
    expect(preview.activeRequest).toBeNull()
    expect(preview.retained.length).toBeGreaterThan(0)
  })

  // Told before they confirm. Absent, not "0", when nothing is at stake or the read failed.
  it("says how many points would be lost, and stays silent when there are none or the read fails", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer())
    expect(await previewClosure("sub-1")).not.toHaveProperty("pointsHeld")

    vi.mocked(findPointsHeld).mockResolvedValueOnce({ points: 1250, valueCents: 1250 })
    expect(await previewClosure("sub-1")).toMatchObject({ pointsHeld: 1250, pointsValueAmount: "12.50" })

    vi.mocked(findPointsHeld).mockRejectedValueOnce(new Error("down"))
    const failed = await previewClosure("sub-1")
    expect(failed).not.toHaveProperty("pointsHeld")
    expect(failed.blockers).toEqual([])
  })

  /** Never null: a block must state its end. */
  it("gives every blocker a clearsAt and a route to act on", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer())
    vi.mocked(findBlockingOrders).mockResolvedValue([blockingOrder()])

    const preview = await previewClosure("sub-1")

    const b = preview.blockers[0]!
    expect(b.clearsAt).toBeTruthy()
    expect(b.reference).toBe("EFY-HVX2AE")
    expect(b.href).toContain("o-1")
    expect(b.target).toEqual({ kind: "order", id: "o-1" })
  })

  it("marks an awaiting-payment order as shopper-resolvable, and one in transit as not", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer())
    vi.mocked(findBlockingOrders).mockResolvedValue([
      blockingOrder({ id: "o-pending", status: "pending_payment" }),
      blockingOrder({ id: "o-paid", status: "paid" }),
    ])

    const preview = await previewClosure("sub-1")

    expect(preview.blockers[0]!.kind).toBe("order_awaiting_payment")
    expect(preview.blockers[0]!.resolvableByShopper).toBe(true)
    expect(preview.blockers[1]!.kind).toBe("order_in_transit")
    expect(preview.blockers[1]!.resolvableByShopper).toBe(false)
  })

  /** No balance or refund is modelled, so neither may be named as a blocker. */
  it("never emits a blocker the platform does not actually model", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer())
    vi.mocked(findBlockingOrders).mockResolvedValue([blockingOrder()])

    const preview = await previewClosure("sub-1")
    const kinds = preview.blockers.map((b) => b.kind)

    expect(kinds).not.toContain("outstanding_balance")
    expect(kinds).not.toContain("pending_refund")
    kinds.forEach((k) => expect(["order_awaiting_payment", "order_in_transit"]).toContain(k))
  })

  it("surfaces a live request so the flow can offer restore instead of a second closure", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer({ closure_state: "closing" }))
    vi.mocked(findLiveRequest).mockResolvedValue({
      id: "r-1",
      customer_id: "c-1",
      requested_at: new Date("2026-08-01T00:00:00Z"),
      erase_after: new Date("2026-08-31T00:00:00Z"),
      verification_method: "email_code",
      cancelled_at: null,
      cancelled_reason: null,
    })

    const preview = await previewClosure("sub-1")

    expect(preview.activeRequest).toEqual({
      requestedAt: "2026-08-01T00:00:00.000Z",
      eraseAfter: "2026-08-31T00:00:00.000Z",
    })
  })
})

describe("requestClosure", () => {
  it("verifies the code BEFORE writing anything, then revokes every session", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer())
    vi.mocked(closeAccount).mockResolvedValue({
      customer: customer({ closure_state: "closing" }),
      eraseAfter: new Date("2026-09-02T00:00:00Z"),
    })

    const result = await requestClosure("sub-1", "access-token", "123456")

    expect(cognito.verifyEmailCode).toHaveBeenCalledWith("access-token", "123456")
    expect(closeAccount).toHaveBeenCalled()
    expect(cognito.globalSignOut).toHaveBeenCalledWith("access-token")
    expect(result.allSessionsRevoked).toBe(true)
    expect(result.eraseAfter).toBe("2026-09-02T00:00:00.000Z")

    // A session that cannot produce a valid code must never reach the write.
    const verifyOrder = vi.mocked(cognito.verifyEmailCode).mock.invocationCallOrder[0]!
    const writeOrder = vi.mocked(closeAccount).mock.invocationCallOrder[0]!
    expect(verifyOrder).toBeLessThan(writeOrder)
  })

  it("does not write when the code is rejected", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer())
    vi.mocked(cognito.verifyEmailCode).mockRejectedValue(
      Object.assign(new Error("bad code"), { name: "CodeMismatchException" }),
    )

    await expect(requestClosure("sub-1", "access-token", "000000")).rejects.toThrow()
    expect(closeAccount).not.toHaveBeenCalled()
  })

  /** Re-evaluated at confirmation: an order can be placed after the preview. */
  it("re-checks blockers at confirmation time", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer())
    vi.mocked(findBlockingOrders).mockResolvedValue([blockingOrder()])

    await expect(requestClosure("sub-1", "access-token", "123456")).rejects.toBeInstanceOf(
      ClosureBlockedError,
    )
    expect(cognito.verifyEmailCode).not.toHaveBeenCalled()
    expect(closeAccount).not.toHaveBeenCalled()
  })

  it("refuses a second closure while one is already live", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer({ closure_state: "closing" }))

    await expect(requestClosure("sub-1", "access-token", "123456")).rejects.toBeInstanceOf(
      ClosureAlreadyRequestedError,
    )
  })

  /** A barred customer may still delete their account: barring is not a hold on their data. */
  it("lets a BARRED customer close their account", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer({ status: "barred" }))
    vi.mocked(closeAccount).mockResolvedValue({
      customer: customer({ status: "barred", closure_state: "closing" }),
      eraseAfter: new Date("2026-09-02T00:00:00Z"),
    })

    await expect(requestClosure("sub-1", "access-token", "123456")).resolves.toMatchObject({
      allSessionsRevoked: true,
    })
  })
})

describe("sendClosureChallenge", () => {
  it("will not put a code in an inbox for a request that cannot succeed", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer())
    vi.mocked(findBlockingOrders).mockResolvedValue([blockingOrder()])

    await expect(sendClosureChallenge("sub-1", "access-token")).rejects.toBeInstanceOf(
      ClosureBlockedError,
    )
    expect(cognito.sendEmailVerificationCode).not.toHaveBeenCalled()
  })

  it("falls back to a masked address when Cognito reports no destination", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer())
    vi.mocked(cognito.sendEmailVerificationCode).mockResolvedValue(undefined)

    const result = await sendClosureChallenge("sub-1", "access-token")

    expect(result.maskedDestination).toBe("s•••@example.com")
    expect(result.maskedDestination).not.toContain("shopper@")
  })
})

describe("restoreClosure", () => {
  it("cancels a live request and reopens the account", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer({ closure_state: "closing" }))
    vi.mocked(restoreAccount).mockResolvedValue(customer({ closure_state: "open" }))

    await expect(restoreClosure("sub-1")).resolves.toHaveProperty("restoredAt")
  })

  it("answers distinctly when there was nothing to restore", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customer())
    vi.mocked(restoreAccount).mockResolvedValue(null)

    await expect(restoreClosure("sub-1")).rejects.toBeInstanceOf(NoLiveClosureRequestError)
  })
})
