import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../receipts/service", () => ({ resendReceipt: vi.fn() }))
vi.mock("../password/identity", () => ({
  requireCaller: vi.fn(() => ({ sub: "sub-abc", accessToken: "tok" })),
  TokenMismatchError: class TokenMismatchError extends Error {},
}))

import { handler } from "../functions/customer-orders-v1-id-receipt-post"
import { resendReceipt } from "../receipts/service"

const mockResend = vi.mocked(resendReceipt)

const event = (id = "order-1") =>
  ({
    pathParameters: { id },
    requestContext: { requestId: "req-1", http: { method: "POST", path: "/" } },
    headers: {},
  }) as never

const context = { awsRequestId: "aws-1" } as never

async function call(id?: string) {
  const res = await handler(event(id), context)
  return { status: res.statusCode, body: JSON.parse(String(res.body ?? "{}")) }
}

describe("POST /customer/v1/orders/{id}/receipt (052 US4)", () => {
  beforeEach(() => mockResend.mockReset())

  it("accepts a queued resend with 202 — it enqueues, it does not send", async () => {
    mockResend.mockResolvedValue({ status: "queued" })
    const res = await call()

    expect(res.status).toBe(202)
    expect(res.body).toEqual({ status: "queued" })
  })

  it("refuses a rate-limited request with 429 and explains it plainly", async () => {
    mockResend.mockResolvedValue({ status: "rate_limited" })
    const res = await call()

    expect(res.status).toBe(429)
    // ⚠ A refusal a shopper cannot understand is indistinguishable from a bug. It must tell them what
    // to do next, not merely that they were refused.
    expect(String(res.body.detail)).toMatch(/inbox|spam|later/i)
  })

  it("refuses an unpaid order with 409", async () => {
    mockResend.mockResolvedValue({ status: "not_paid" })
    expect((await call()).status).toBe(409)
  })

  /**
   * ⚠ SC-008 — THE HEADLINE SECURITY PROPERTY OF THIS ROUTE.
   *
   * "Someone else's order" and "no such order" must be BYTE-IDENTICAL. Any difference — a status code,
   * a word, a field — turns this endpoint into an oracle: a caller could enumerate order ids and learn
   * which ones are real. The repository produces one `not_found` for both cases precisely so this
   * handler has no opportunity to distinguish them.
   */
  it("⚠ refuses another customer's order and a non-existent one IDENTICALLY", async () => {
    mockResend.mockResolvedValue({ status: "not_found" })
    const someoneElses = await handler(event("11111111-1111-4111-8111-111111111111"), context)

    mockResend.mockResolvedValue({ status: "not_found" })
    const doesNotExist = await handler(event("99999999-9999-4999-8999-999999999999"), context)

    expect(someoneElses.statusCode).toBe(404)
    expect(doesNotExist.statusCode).toBe(404)

    // Byte-identical bodies. The order id must not echo back — that alone would differ.
    expect(someoneElses.body).toBe(doesNotExist.body)
  })

  it("rejects a request with no order id rather than guessing one", async () => {
    const res = await handler({ ...(event() as object), pathParameters: {} } as never, context)
    expect(res.statusCode).toBe(400)
    expect(mockResend).not.toHaveBeenCalled()
  })

  /**
   * ⚠ THE OPEN-RELAY GUARD. The receipt carries a person's name, delivery address and purchase
   * history. If an `email` in the body could redirect it, any session holder could mail someone
   * else's receipt anywhere. The body is ignored entirely — this asserts the handler never reads it.
   */
  it("⚠ ignores any email supplied in the request body", async () => {
    mockResend.mockResolvedValue({ status: "queued" })
    const withBody = {
      ...(event() as object),
      body: JSON.stringify({ email: "attacker@example.com" }),
    } as never

    await handler(withBody, context)

    // The service is called with the AUTHENTICATED subject and the order id — and nothing else.
    expect(mockResend).toHaveBeenCalledWith("order-1", "sub-abc")
    expect(mockResend).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("attacker"),
    )
  })
})
