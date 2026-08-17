import { beforeEach, describe, expect, it, vi } from "vitest"

const insertSubmission = vi.fn()
const findCustomerBySub = vi.fn()
const sendEmail = vi.fn()

vi.mock("./repo", () => ({
  insertSubmission: (...a: unknown[]) => insertSubmission(...a),
  findCustomerBySub: (...a: unknown[]) => findCustomerBySub(...a),
}))
vi.mock("@effy/email-kit/send", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}))
vi.mock("@effy/edge-shared", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { submitFeedback } = await import("./service")

const config = { windowMinutes: 60, maxPerWindow: 5, sourceSalt: "test-salt" }

const guest = { kind: "guest" as const, sourceIp: "203.0.113.7" }
const customerCtx = { kind: "customer" as const, cognitoSub: "sub-abc" }

/** A valid guest body. */
const validBody = {
  category: "suggestion",
  message: "Please add a dark mode.",
  source: "general",
  platform: "web",
  email: "shopper@example.com",
}

beforeEach(() => {
  vi.clearAllMocks()
  insertSubmission.mockResolvedValue({ status: "ok", referenceCode: "FB-ABC123" })
  findCustomerBySub.mockResolvedValue(null)
  sendEmail.mockResolvedValue(undefined)
})

describe("submitFeedback — validation before any work", () => {
  it("rejects a missing/whitespace message with no insert and no email", async () => {
    for (const message of ["", "   ", "\n\t "]) {
      const r = await submitFeedback({ ...validBody, message }, guest, config)
      expect(r).toEqual({ status: "invalid", field: "message" })
    }
    expect(insertSubmission).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("rejects a message over the max length", async () => {
    const r = await submitFeedback({ ...validBody, message: "x".repeat(5001) }, guest, config)
    expect(r).toEqual({ status: "invalid", field: "message" })
    expect(insertSubmission).not.toHaveBeenCalled()
  })

  it("rejects an unknown category", async () => {
    const r = await submitFeedback({ ...validBody, category: "rant" }, guest, config)
    expect(r).toEqual({ status: "invalid", field: "category" })
  })

  it("rejects an out-of-range or non-integer rating", async () => {
    for (const rating of [0, 6, 3.5, "5"]) {
      const r = await submitFeedback({ ...validBody, rating }, guest, config)
      expect(r).toEqual({ status: "invalid", field: "rating" })
    }
  })

  it("rejects an invalid source or platform", async () => {
    expect(await submitFeedback({ ...validBody, source: "nowhere" }, guest, config)).toEqual({
      status: "invalid",
      field: "source",
    })
    expect(await submitFeedback({ ...validBody, platform: "desktop" }, guest, config)).toEqual({
      status: "invalid",
      field: "platform",
    })
  })

  it("rejects a malformed email (shared EMAIL_SHAPE) but preserves the rest for retry", async () => {
    for (const email of ["nope", "no@domain", "person@example", "a b@c.com"]) {
      const r = await submitFeedback({ ...validBody, email }, guest, config)
      expect(r).toEqual({ status: "invalid", field: "email" })
    }
    expect(insertSubmission).not.toHaveBeenCalled()
  })
})

describe("submitFeedback — guest path", () => {
  it("stores the submission and sends the acknowledgement when an email is given", async () => {
    const r = await submitFeedback(validBody, guest, config)
    expect(r).toEqual({ status: "ok", referenceCode: "FB-ABC123" })

    // Stored as UNVERIFIED guest, not linked to any customer.
    const insertArg = insertSubmission.mock.calls[0]![0]
    expect(insertArg.customerId).toBeNull()
    expect(insertArg.emailVerified).toBe(false)
    expect(insertArg.submitterEmail).toBe("shopper@example.com")

    expect(sendEmail).toHaveBeenCalledWith(
      "feedback-received",
      { referenceCode: "FB-ABC123", category: "A suggestion" },
      { to: "shopper@example.com", audience: "customer" },
      expect.anything(),
    )
  })

  it("stores and acknowledges with NO email sent when none is given", async () => {
    const { email, ...noEmail } = validBody
    const r = await submitFeedback(noEmail, guest, config)
    expect(r.status).toBe("ok")
    expect(insertSubmission).toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("normalises the email (trim + lowercase) before storing", async () => {
    await submitFeedback({ ...validBody, email: "  Shopper@Example.COM " }, guest, config)
    expect(insertSubmission.mock.calls[0]![0].submitterEmail).toBe("shopper@example.com")
  })

  it("stores the message RAW so pasted markup is preserved for inert rendering downstream", async () => {
    const message = "<script>alert(1)</script> the search is slow"
    await submitFeedback({ ...validBody, message }, guest, config)
    expect(insertSubmission.mock.calls[0]![0].message).toBe(message)
  })
})

describe("submitFeedback — signed-in path", () => {
  it("links the customer and uses the TRUSTED profile email, ignoring a body email", async () => {
    findCustomerBySub.mockResolvedValue({
      id: "cust-1",
      email: "real@profile.com",
      givenName: "Sam",
      familyName: "Lee",
    })
    const r = await submitFeedback({ ...validBody, email: "spoof@evil.com" }, customerCtx, config)
    expect(r.status).toBe("ok")

    const arg = insertSubmission.mock.calls[0]![0]
    expect(arg.customerId).toBe("cust-1")
    expect(arg.emailVerified).toBe(true)
    expect(arg.submitterEmail).toBe("real@profile.com")
    expect(sendEmail.mock.calls[0]![2]).toEqual({ to: "real@profile.com", audience: "customer" })
  })
})

describe("submitFeedback — rate limit (FR-016)", () => {
  it("returns rate_limited without disclosing the threshold, and sends no email", async () => {
    insertSubmission.mockResolvedValue({ status: "rate_limited" })
    const r = await submitFeedback(validBody, guest, config)
    expect(r).toEqual({ status: "rate_limited" })
    expect(sendEmail).not.toHaveBeenCalled()
    // The result carries no numeric threshold field of any kind.
    expect(JSON.stringify(r)).not.toMatch(/\d/)
  })
})

describe("submitFeedback — failure isolation (FR-015)", () => {
  it("does NOT lose the submission when the thank-you email throws", async () => {
    sendEmail.mockRejectedValue(new Error("SES down"))
    const r = await submitFeedback(validBody, guest, config)
    expect(r).toEqual({ status: "ok", referenceCode: "FB-ABC123" })
  })

  it("returns error when the STORE fails", async () => {
    insertSubmission.mockRejectedValue(new Error("db down"))
    const r = await submitFeedback(validBody, guest, config)
    expect(r).toEqual({ status: "error" })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("retries on a reference-code collision (unique violation) then succeeds", async () => {
    insertSubmission
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }))
      .mockResolvedValueOnce({ status: "ok", referenceCode: "FB-RETRY1" })
    const r = await submitFeedback(validBody, guest, config)
    expect(r).toEqual({ status: "ok", referenceCode: "FB-RETRY1" })
    expect(insertSubmission).toHaveBeenCalledTimes(2)
  })
})
