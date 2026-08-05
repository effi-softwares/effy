import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The consumer's operational behaviour — batch independence, and log hygiene.
 *
 * ⚠ THE LOG TEST IS THE POINT OF THIS FILE. 035 established that SES's own rejection text embeds the
 * recipient, which is why its `logFailure` logs `err.name` and never `err.message`. This feature
 * receives that same text on the way IN, on every bounce, and writes structured logs about it. One
 * careless field and every locked-out customer's address is in CloudWatch forever. A rule that is
 * only written down is a rule that eventually gets broken; this makes it mechanical.
 */

const recordOutcome = vi.fn()
vi.mock("./service", async () => {
  const actual = await vi.importActual<typeof import("./service")>("./service")
  return { ...actual, recordOutcome }
})

const logged: unknown[] = []
vi.mock("@effy/edge-shared", () => ({
  logger: {
    info: (...a: unknown[]) => logged.push(a),
    warn: (...a: unknown[]) => logged.push(a),
    error: (...a: unknown[]) => logged.push(a),
  },
}))

const emitted: string[] = []
vi.mock("../lib/mail-metrics", async () => {
  const actual = await vi.importActual<typeof import("../lib/mail-metrics")>("../lib/mail-metrics")
  return {
    ...actual,
    emit: (m: string) => {
      emitted.push(m)
    },
  }
})

const { handler } = await import("../functions/ses-event-consumer")

const CONTEXT = { callbackWaitsForEmptyEventLoop: true } as any

function snsEvent(...messages: unknown[]) {
  return {
    Records: messages.map((m, i) => ({
      Sns: {
        MessageId: `sns-${i}`,
        Message: typeof m === "string" ? m : JSON.stringify(m),
      },
    })),
  } as any
}

const HARD_BOUNCE = {
  eventType: "Bounce",
  mail: { messageId: "m-1", timestamp: "2026-08-05T09:14:22.000Z" },
  bounce: {
    bounceType: "Permanent",
    bounceSubType: "General",
    bouncedRecipients: [
      {
        emailAddress: "locked.out.person@example.com",
        diagnosticCode: "smtp;550 5.1.1 <locked.out.person@example.com> user unknown",
      },
    ],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  logged.length = 0
  emitted.length = 0
  recordOutcome.mockResolvedValue({ recorded: true, state: "undeliverable" })
})

describe("ses event consumer", () => {
  it("⚠ writes NO address and NO diagnostic text to the logs", async () => {
    await handler(snsEvent(HARD_BOUNCE), CONTEXT)

    const dump = JSON.stringify(logged)
    expect(dump).not.toContain("locked.out.person@example.com")
    expect(dump).not.toContain("user unknown")
    // Nothing that even looks like an address.
    expect(dump).not.toMatch(/@example\.com/)
    // But it IS correlatable — a fingerprint, so two lines about one person can be joined up.
    expect(dump).toMatch(/"addr":"[0-9a-f]{12}"/)
  })

  it("logs the facts an operator actually needs", async () => {
    await handler(snsEvent(HARD_BOUNCE), CONTEXT)
    const dump = JSON.stringify(logged)
    expect(dump).toContain("m-1")
    expect(dump).toContain("Permanent/General")
    expect(dump).toContain("undeliverable")
  })

  it("⚠ one malformed record does not discard the rest of the batch", async () => {
    await handler(snsEvent("{ not json", HARD_BOUNCE), CONTEXT)
    expect(recordOutcome).toHaveBeenCalledTimes(1)
  })

  it("⚠ never throws on unparseable input — a throw retries forever and kills the consumer", async () => {
    await expect(handler(snsEvent("{ not json"), CONTEXT)).resolves.toBeUndefined()
    expect(recordOutcome).not.toHaveBeenCalled()
  })

  it("⚠ never throws on an event type it does not handle", async () => {
    await expect(
      handler(snsEvent({ eventType: "Open", mail: { messageId: "m-2" } }), CONTEXT),
    ).resolves.toBeUndefined()
    expect(recordOutcome).not.toHaveBeenCalled()
  })

  it("emits the hard-bounce metric — the alarm that sees ONE person", async () => {
    await handler(snsEvent(HARD_BOUNCE), CONTEXT)
    expect(emitted).toContain("mail_hard_bounce")
  })

  it("⚠ emits NO metric for a duplicate — a redelivery must not double-count", async () => {
    recordOutcome.mockResolvedValue({ recorded: false, state: "undeliverable" })
    await handler(snsEvent(HARD_BOUNCE), CONTEXT)
    expect(emitted).toEqual([])
  })
})
