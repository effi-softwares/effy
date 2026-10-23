import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./repo", () => ({ enqueueResend: vi.fn() }))

import { enqueueResend } from "./repo"
import { resendReceipt } from "./service"

const mockEnqueue = vi.mocked(enqueueResend)

describe("resendReceipt (052 US4)", () => {
  beforeEach(() => {
    mockEnqueue.mockReset()
    delete process.env.RECEIPT_RESEND_WINDOW_MINUTES
    delete process.env.RECEIPT_RESEND_MAX_PER_WINDOW
  })

  it("passes the AUTHENTICATED subject through, never a caller-supplied identity", async () => {
    mockEnqueue.mockResolvedValue({ status: "queued" })
    await resendReceipt("order-1", "sub-abc")

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-1", cognitoSub: "sub-abc" }),
    )
  })

  it("applies the configured rate limit, and a sane default when unset", async () => {
    mockEnqueue.mockResolvedValue({ status: "queued" })

    await resendReceipt("o", "s")
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ windowMinutes: 60, maxPerWindow: 3 }),
    )

    process.env.RECEIPT_RESEND_WINDOW_MINUTES = "15"
    process.env.RECEIPT_RESEND_MAX_PER_WINDOW = "1"
    await resendReceipt("o", "s")
    expect(mockEnqueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ windowMinutes: 15, maxPerWindow: 1 }),
    )
  })

  /** A garbage limit falls back to the default rather than refusing everything or comparing NaN. */
  it("⚠ falls back to the default when the configured limit is unusable", async () => {
    mockEnqueue.mockResolvedValue({ status: "queued" })

    for (const bad of ["", "0", "-5", "abc"]) {
      process.env.RECEIPT_RESEND_MAX_PER_WINDOW = bad
      await resendReceipt("o", "s")
      expect(mockEnqueue).toHaveBeenLastCalledWith(expect.objectContaining({ maxPerWindow: 3 }))
    }
  })

  it("returns each outcome unchanged for the handler to map", async () => {
    for (const status of ["queued", "rate_limited", "not_found", "not_paid", "no_recipient"] as const) {
      mockEnqueue.mockResolvedValue({ status })
      expect(await resendReceipt("o", "s")).toEqual({ status })
    }
  })
})
