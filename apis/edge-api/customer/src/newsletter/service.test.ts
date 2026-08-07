import { beforeEach, describe, expect, it, vi } from "vitest"

const upsertSubscriber = vi.fn()
const confirmSubscriber = vi.fn()
const sendEmail = vi.fn()

vi.mock("./repo", () => ({
  upsertSubscriber: (...a: unknown[]) => upsertSubscriber(...a),
  confirmSubscriber: (...a: unknown[]) => confirmSubscriber(...a),
}))
vi.mock("@effy/email-kit/send", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}))
vi.mock("@effy/edge-shared", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { confirm, expiresInWords, normaliseEmail, subscribe } = await import("./service")

const config = {
  confirmBaseUrl: "https://x.test/newsletter/confirm",
  ttlHours: 24,
  cooldownMinutes: 60,
}

beforeEach(() => {
  vi.clearAllMocks()
  upsertSubscriber.mockResolvedValue({ sendDue: true })
  confirmSubscriber.mockResolvedValue({ confirmed: true })
  sendEmail.mockResolvedValue(undefined)
})

describe("subscribe — validation happens before any work (FR-030)", () => {
  for (const bad of ["", "   ", "nope", "no@domain", "@example.com", "a@b", "a b@c.com"]) {
    it(`rejects ${JSON.stringify(bad)} with no DB call and no email`, async () => {
      expect(await subscribe(bad, config)).toEqual({ status: "invalid" })
      expect(upsertSubscriber).not.toHaveBeenCalled()
      expect(sendEmail).not.toHaveBeenCalled()
    })
  }

  it("rejects a non-string body value", async () => {
    expect(await subscribe(undefined, config)).toEqual({ status: "invalid" })
    expect(await subscribe(42, config)).toEqual({ status: "invalid" })
    expect(upsertSubscriber).not.toHaveBeenCalled()
  })

  /** ⚠ RFC 5321 caps a path at 254 octets. Longer is not an address; accepting it lets a caller push
   *  arbitrary length through the validator and into a query parameter. */
  it("rejects an over-long address before touching the database", async () => {
    const huge = `${"a".repeat(250)}@example.com`
    expect(await subscribe(huge, config)).toEqual({ status: "invalid" })
    expect(upsertSubscriber).not.toHaveBeenCalled()
  })

  it("normalises case and surrounding whitespace before storing", async () => {
    await subscribe("  Person@Example.COM  ", config)

    expect(upsertSubscriber).toHaveBeenCalledWith(
      expect.objectContaining({ email: "person@example.com" }),
    )
  })

  it("normaliseEmail is the single place that decides the stored form", () => {
    expect(normaliseEmail("  A@B.com ")).toBe("a@b.com")
  })
})

describe("subscribe — the happy path", () => {
  it("records the subscription and sends the confirmation", async () => {
    expect(await subscribe("person@example.com", config)).toEqual({ status: "ok" })

    expect(upsertSubscriber).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0]![0]).toBe("newsletter-confirmation")
    expect(sendEmail.mock.calls[0]![2]).toMatchObject({ to: "person@example.com", audience: "customer" })
  })

  /** ⚠ The token goes in the link; only its HASH reaches the database. */
  it("stores a hash, never the token that is emailed", async () => {
    await subscribe("person@example.com", config)

    const { tokenHash } = upsertSubscriber.mock.calls[0]![0] as { tokenHash: string }
    const confirmUrl = (sendEmail.mock.calls[0]![1] as { confirmUrl: string }).confirmUrl
    const token = new URL(confirmUrl).searchParams.get("token")!

    expect(token.length).toBeGreaterThan(20)
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenHash).not.toContain(token)
    expect(confirmUrl).not.toContain(tokenHash)
  })

  it("issues a different token every time", async () => {
    await subscribe("a@example.com", config)
    await subscribe("b@example.com", config)

    const [first, second] = upsertSubscriber.mock.calls.map((c) => (c[0] as { tokenHash: string }).tokenHash)
    expect(first).not.toBe(second)
  })

  it("builds the confirm link from the configured base URL", async () => {
    await subscribe("person@example.com", config)

    const { confirmUrl } = sendEmail.mock.calls[0]![1] as { confirmUrl: string }
    expect(confirmUrl.startsWith("https://x.test/newsletter/confirm?token=")).toBe(true)
  })
})

/**
 * ⚠ FR-035 — the ONLY enforcement of it, now that the gateway throttle is gone (spec amendment,
 * research R4). Before this test the requirement had an implementation and no coverage at all.
 */
describe("subscribe — abuse resistance (FR-035)", () => {
  it("sends NOTHING when the repo says the cooldown has not elapsed", async () => {
    upsertSubscriber.mockResolvedValue({ sendDue: false })

    expect(await subscribe("person@example.com", config)).toEqual({ status: "ok" })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("submitting the same address repeatedly sends exactly one email", async () => {
    // First submission is due; every later one is inside the cooldown.
    upsertSubscriber
      .mockResolvedValueOnce({ sendDue: true })
      .mockResolvedValue({ sendDue: false })

    for (let i = 0; i < 8; i++) await subscribe("person@example.com", config)

    expect(upsertSubscriber).toHaveBeenCalledTimes(8)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  /**
   * ⚠ WHAT THE COOLDOWN DOES **NOT** COVER, asserted so it stays a recorded decision rather than an
   * assumption. It caps email PER ADDRESS. A script submitting thousands of DISTINCT addresses still
   * gets one email each — the same per-source/per-identity split 035 hit (FR-012 vs FR-013: two
   * mechanisms, not one). Closing it needs WAF or a gateway throttle, which this slice does not build.
   */
  it("does not cap distinct addresses — recorded, not fixed", async () => {
    for (let i = 0; i < 5; i++) await subscribe(`person${i}@example.com`, config)

    expect(sendEmail).toHaveBeenCalledTimes(5)
  })
})

/**
 * ⚠ FR-032 — the property that stops this form being an oracle. Pinned so a future "helpful" 409 or
 * "you're already subscribed" message cannot be added without failing a test.
 */
describe("subscribe — non-enumeration (FR-032)", () => {
  it("returns a byte-identical result for a new, a pending and a confirmed address", async () => {
    upsertSubscriber.mockResolvedValueOnce({ sendDue: true }) // new → sends
    const fresh = await subscribe("new@example.com", config)

    upsertSubscriber.mockResolvedValueOnce({ sendDue: false }) // pending, in cooldown → no send
    const pending = await subscribe("pending@example.com", config)

    upsertSubscriber.mockResolvedValueOnce({ sendDue: false }) // already confirmed → no send
    const confirmed = await subscribe("confirmed@example.com", config)

    expect(JSON.stringify(fresh)).toBe(JSON.stringify(pending))
    expect(JSON.stringify(pending)).toBe(JSON.stringify(confirmed))
    expect(fresh).toEqual({ status: "ok" })
  })

  it("never returns an `already` status — there is no such arm", async () => {
    upsertSubscriber.mockResolvedValue({ sendDue: false })

    const result = await subscribe("person@example.com", config)
    expect(result.status).not.toBe("already")
    expect(result.status).toBe("ok")
  })
})

describe("subscribe — failure is retryable, not silent", () => {
  /** ⚠ The template declares `onSendFailure: "throw"`, so a failed send reaches the service. */
  it("reports `error` when the confirmation email cannot be sent", async () => {
    sendEmail.mockRejectedValue(new Error("SES is down"))

    expect(await subscribe("person@example.com", config)).toEqual({ status: "error" })
  })

  it("reports `error` when the database write fails", async () => {
    upsertSubscriber.mockRejectedValue(new Error("no connection"))

    expect(await subscribe("person@example.com", config)).toEqual({ status: "error" })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  /** ⚠ An error must not become an oracle either — it says nothing about the address. */
  it("returns the same error shape whatever failed", async () => {
    sendEmail.mockRejectedValue(new Error("a"))
    const sendFailed = await subscribe("person@example.com", config)

    vi.clearAllMocks()
    upsertSubscriber.mockRejectedValue(new Error("b"))
    const dbFailed = await subscribe("person@example.com", config)

    expect(JSON.stringify(sendFailed)).toBe(JSON.stringify(dbFailed))
  })
})

describe("confirm — single-use, TTL-bounded, and never disclosing", () => {
  it("confirms a valid token", async () => {
    expect(await confirm("a-real-token", config)).toEqual({ status: "confirmed" })
  })

  it("hashes the token before looking it up", async () => {
    await confirm("a-real-token", config)

    const { tokenHash } = confirmSubscriber.mock.calls[0]![0] as { tokenHash: string }
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenHash).not.toContain("a-real-token")
  })

  /**
   * ⚠ INVALID, EXPIRED, ALREADY-USED AND MISSING ALL LOOK THE SAME. Distinguishing them would confirm
   * that a token existed — a small oracle — and there is nothing the holder of a dead token could do
   * differently in any case.
   */
  it("reports `expired` identically for a missing, empty, over-long or unmatched token", async () => {
    confirmSubscriber.mockResolvedValue({ confirmed: false })

    const outcomes = [
      await confirm(undefined, config),
      await confirm("", config),
      await confirm("x".repeat(600), config),
      await confirm("wrong-token", config),
    ]

    for (const o of outcomes) expect(o).toEqual({ status: "expired" })
  })

  it("does no database work for a structurally impossible token", async () => {
    await confirm(undefined, config)
    await confirm("", config)

    expect(confirmSubscriber).not.toHaveBeenCalled()
  })

  /** A 500 on a link in an email is worse than a clear "this link has expired". */
  it("degrades to `expired` when the database is unavailable", async () => {
    confirmSubscriber.mockRejectedValue(new Error("no connection"))

    expect(await confirm("a-real-token", config)).toEqual({ status: "expired" })
  })
})

describe("expiresInWords — the email says a duration, not a timestamp", () => {
  it("renders whole days as days, and a single day as hours", () => {
    expect(expiresInWords(24)).toBe("24 hours")
    expect(expiresInWords(48)).toBe("2 days")
    expect(expiresInWords(72)).toBe("3 days")
  })

  it("renders sub-day values as hours", () => {
    expect(expiresInWords(1)).toBe("1 hour")
    expect(expiresInWords(6)).toBe("6 hours")
  })
})
