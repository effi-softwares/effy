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

  /** RFC 5321 caps a path at 254 octets. */
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

  /** The token goes in the link; only its hash reaches the database. */
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

/** The cooldown is the only rate limit. */
describe("subscribe — abuse resistance (FR-035)", () => {
  it("sends NOTHING when the repo says the cooldown has not elapsed", async () => {
    upsertSubscriber.mockResolvedValue({ sendDue: false })

    expect(await subscribe("person@example.com", config)).toEqual({ status: "ok" })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("submitting the same address repeatedly sends exactly one email", async () => {
    upsertSubscriber
      .mockResolvedValueOnce({ sendDue: true })
      .mockResolvedValue({ sendDue: false })

    for (let i = 0; i < 8; i++) await subscribe("person@example.com", config)

    expect(upsertSubscriber).toHaveBeenCalledTimes(8)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  /** It caps email per address; thousands of distinct addresses still get one each (that needs WAF). */
  it("does not cap distinct addresses — recorded, not fixed", async () => {
    for (let i = 0; i < 5; i++) await subscribe(`person${i}@example.com`, config)

    expect(sendEmail).toHaveBeenCalledTimes(5)
  })
})

/** No answer may reveal whether an address is subscribed. */
describe("subscribe — non-enumeration (FR-032)", () => {
  it("returns a byte-identical result for a new, a pending and a confirmed address", async () => {
    upsertSubscriber.mockResolvedValueOnce({ sendDue: true })
    const fresh = await subscribe("new@example.com", config)

    upsertSubscriber.mockResolvedValueOnce({ sendDue: false })
    const pending = await subscribe("pending@example.com", config)

    upsertSubscriber.mockResolvedValueOnce({ sendDue: false })
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
  /** `onSendFailure: "throw"`, so a failed send reaches the service. */
  it("reports `error` when the confirmation email cannot be sent", async () => {
    sendEmail.mockRejectedValue(new Error("SES is down"))

    expect(await subscribe("person@example.com", config)).toEqual({ status: "error" })
  })

  it("reports `error` when the database write fails", async () => {
    upsertSubscriber.mockRejectedValue(new Error("no connection"))

    expect(await subscribe("person@example.com", config)).toEqual({ status: "error" })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  /** An error says nothing about the address. */
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

  /** Invalid, expired, used and missing tokens look the same. */
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
