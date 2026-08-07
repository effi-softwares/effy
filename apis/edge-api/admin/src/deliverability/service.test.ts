import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The delivery-outcome consumer's decisions.
 *
 * ⚠ WHAT THESE TESTS ARE ACTUALLY PROTECTING. Every one of them guards a way this feature could
 * ship looking correct and be wrong in a way nobody notices for months — a duplicate that
 * double-counts, a stale event that resurrects a dead address, an unclassifiable bounce that locks
 * someone out on a guess, or a log line with an address in it.
 */

const sesSend = vi.fn()

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = sesSend
  },
  GetSuppressedDestinationCommand: class {
    constructor(readonly input: unknown) {}
  },
  DeleteSuppressedDestinationCommand: class {
    constructor(readonly input: unknown) {}
  },
}))

const repo = {
  insertEvent: vi.fn(),
  upsertStatus: vi.fn(),
  getStatus: vi.fn(),
  listStatuses: vi.fn(),
  listEvents: vi.fn(),
  findSubject: vi.fn(),
  markRepaired: vi.fn(),
  toListItemDTO: vi.fn((s: any, subject: any) => ({ address: s.address, state: s.state, subject })),
}

vi.mock("./repository", () => repo)

const { parseOutcome, recordOutcome, repair, stateFor } = await import("./service")

const BOUNCE = {
  eventType: "Bounce",
  mail: {
    messageId: "0100018f-aaaa",
    timestamp: "2026-08-05T09:14:22.000Z",
    destination: ["person@example.com"],
  },
  bounce: {
    bounceType: "Permanent",
    bounceSubType: "General",
    bouncedRecipients: [
      { emailAddress: "Person@Example.com", diagnosticCode: "smtp;550 5.1.1 user unknown" },
    ],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  repo.insertEvent.mockResolvedValue(true)
  repo.upsertStatus.mockResolvedValue(undefined)
})

describe("stateFor", () => {
  it("a Permanent bounce is the only thing that marks an account undeliverable", () => {
    expect(stateFor({ eventType: "bounce", subType: "Permanent/General" } as any)).toBe(
      "undeliverable",
    )
  })

  it("a Transient bounce is soft — a full mailbox is not a lockout", () => {
    expect(stateFor({ eventType: "bounce", subType: "Transient/MailboxFull" } as any)).toBe(
      "soft_failing",
    )
  })

  it("⚠ Undetermined is treated as TRANSIENT — never lock someone out on a guess", () => {
    // The bias is deliberately toward under-reporting. A missed lockout is found when the person
    // contacts support; a FALSE lockout is found by nobody, because the person simply leaves.
    expect(stateFor({ eventType: "bounce", subType: "Undetermined" } as any)).toBe("soft_failing")
    expect(stateFor({ eventType: "bounce", subType: null } as any)).toBe("soft_failing")
  })

  it("a delivery is what lets an address recover — the state must be able to improve", () => {
    expect(stateFor({ eventType: "delivery" } as any)).toBe("reachable")
  })

  it("⚠ a reject does not move the conclusion — it says nothing about the address", () => {
    expect(stateFor({ eventType: "reject" } as any)).toBe("reachable")
  })

  it("a complaint is its own state, not a bounce", () => {
    expect(stateFor({ eventType: "complaint", subType: "abuse" } as any)).toBe("complained")
  })
})

describe("parseOutcome", () => {
  it("normalises a hard bounce, preserving the address's ORIGINAL case", () => {
    const [e] = parseOutcome(BOUNCE)
    expect(e).toBeDefined()
    // ⚠ Both forms are carried: lower-cased for lookup, exact bytes for the suppression API, which
    // is case-sensitive. Losing the raw form is how a repair silently fails to repair anything.
    expect(e!.address).toBe("person@example.com")
    expect(e!.rawAddress).toBe("Person@Example.com")
    expect(e!.subType).toBe("Permanent/General")
    expect(e!.diagnostic).toContain("550 5.1.1")
    expect(e!.messageId).toBe("0100018f-aaaa")
    // ⚠ 038: no `effy-template` tag on this fixture → NULL, meaning "Cognito-sent, or pre-038".
    expect(e!.templateId).toBeNull()
  })

  it("⚠ 038: attributes an outcome to its template from the SES `effy-template` tag", () => {
    // This is how "which message is bouncing?" becomes answerable. SES `mail.tags` is a map of
    // string→string[]; the platform sets exactly one value.
    const [e] = parseOutcome({
      ...BOUNCE,
      mail: { ...BOUNCE.mail, tags: { "effy-template": ["auth-sign-in-code"] } },
    })
    expect(e!.templateId).toBe("auth-sign-in-code")
  })

  it("⚠ 038: a message with no tag attributes to NULL, never throws (Cognito sends cannot be tagged)", () => {
    const [e] = parseOutcome({ ...BOUNCE, mail: { ...BOUNCE.mail, tags: {} } })
    expect(e!.templateId).toBeNull()
  })

  it("⚠ fans out one message naming several recipients into several events", () => {
    // This platform sends one code to one address — but the contract does not guarantee that, and
    // a consumer that assumes it silently drops everyone after the first.
    const events = parseOutcome({
      ...BOUNCE,
      bounce: {
        ...BOUNCE.bounce,
        bouncedRecipients: [
          { emailAddress: "a@example.com" },
          { emailAddress: "b@example.com" },
          { emailAddress: "c@example.com" },
        ],
      },
    })
    expect(events.map((e) => e.address)).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ])
  })

  it("⚠ returns [] for an unknown event type rather than throwing", () => {
    // Throwing makes the delivery retry forever, turning one unrecognised event into an outage of
    // the whole consumer — and the consumer is the only thing that can see a lockout.
    expect(parseOutcome({ eventType: "Open", mail: { messageId: "x" } })).toEqual([])
  })

  it("⚠ returns [] for a malformed payload rather than throwing", () => {
    expect(parseOutcome(null)).toEqual([])
    expect(parseOutcome("not an object")).toEqual([])
    expect(parseOutcome({})).toEqual([])
    expect(parseOutcome({ eventType: "Bounce" })).toEqual([]) // no messageId
  })

  it("parses a complaint and a delivery delay", () => {
    const [c] = parseOutcome({
      eventType: "Complaint",
      mail: { messageId: "m1", timestamp: "2026-08-05T00:00:00.000Z" },
      complaint: {
        complaintFeedbackType: "abuse",
        complainedRecipients: [{ emailAddress: "x@example.com" }],
      },
    })
    expect(c!.eventType).toBe("complaint")
    expect(c!.subType).toBe("abuse")

    const [d] = parseOutcome({
      eventType: "DeliveryDelay",
      mail: { messageId: "m2", timestamp: "2026-08-05T00:00:00.000Z" },
      deliveryDelay: {
        delayType: "MailboxFull",
        delayedRecipients: [{ emailAddress: "y@example.com" }],
      },
    })
    expect(d!.eventType).toBe("delivery_delay")
  })
})

describe("recordOutcome", () => {
  it("records a new outcome and advances the status", async () => {
    const [e] = parseOutcome(BOUNCE)
    const res = await recordOutcome(e!)

    expect(res).toEqual({ recorded: true, state: "undeliverable" })
    expect(repo.upsertStatus).toHaveBeenCalledTimes(1)
  })

  it("⚠ does NOT advance the status when the event was a duplicate", async () => {
    // Outcome publication is at-least-once and unordered. If a redelivered bounce advanced the
    // status, bounce_count would double — and an operator reads that number to decide whether an
    // address is worth repairing.
    repo.insertEvent.mockResolvedValue(false)

    const [e] = parseOutcome(BOUNCE)
    const res = await recordOutcome(e!)

    expect(res.recorded).toBe(false)
    expect(repo.upsertStatus).not.toHaveBeenCalled()
  })

  it("⚠ a reject is logged but never moves the status row", async () => {
    const [e] = parseOutcome({
      eventType: "Reject",
      mail: { messageId: "m3", timestamp: "2026-08-05T00:00:00.000Z", destination: ["z@example.com"] },
      reject: { reason: "Bad content" },
    })
    await recordOutcome(e!)
    expect(repo.upsertStatus).not.toHaveBeenCalled()
  })
})

describe("repair", () => {
  const STATUS = {
    address: "person@example.com",
    rawAddress: "Person@Example.com",
    state: "undeliverable" as const,
    reason: "Permanent/General",
    diagnostic: null,
    lastEventAt: "2026-08-05T09:14:22.000Z",
    lastMessageId: "m1",
    bounceCount: 1,
    complaintCount: 0,
    repairedAt: null,
    repairedBy: null,
  }

  beforeEach(() => {
    repo.getStatus.mockResolvedValue(STATUS)
    repo.findSubject.mockResolvedValue(null)
    repo.listEvents.mockResolvedValue([])
    repo.markRepaired.mockResolvedValue(undefined)
    sesSend.mockResolvedValue({})
  })

  it("⚠ calls the mail service with raw_address VERBATIM, case intact", async () => {
    // The suppression API is case-sensitive. A repair that lowercases silently fails to remove an
    // entry that demonstrably exists, and the operator leaves believing the person is unlocked.
    await repair("PERSON@EXAMPLE.COM", "staff-sub", "mailbox restored")

    const cmd = sesSend.mock.calls.find((c) => "EmailAddress" in (c[0] as any).input)
    expect((cmd![0] as any).input.EmailAddress).toBe("Person@Example.com")
  })

  it("⚠ writes NOTHING to the database when the mail service call fails", async () => {
    // Mail service first, database second. The reverse order could commit "repaired" while the
    // address is still blocked — which is the worst outcome available, because it LOOKS fixed.
    sesSend.mockRejectedValueOnce(Object.assign(new Error("boom"), { name: "TooManyRequestsException" }))

    await expect(repair("person@example.com", "staff-sub", "note")).rejects.toThrow()
    expect(repo.markRepaired).not.toHaveBeenCalled()
  })

  it("⚠ treats NotFoundException as SUCCESS — the platform's half still needs clearing", async () => {
    // The common case is a soft_failing address with no suppression entry at all. Treating "not
    // found" as an error would make exactly that case permanently unrepairable.
    sesSend.mockRejectedValueOnce(Object.assign(new Error("nope"), { name: "NotFoundException" }))

    await repair("person@example.com", "staff-sub", "note")
    expect(repo.markRepaired).toHaveBeenCalledTimes(1)
  })

  it("requires a note — an unexplained repair is indistinguishable from a mistake later", async () => {
    await expect(repair("person@example.com", "staff-sub", "   ")).rejects.toThrow(/note/)
    expect(sesSend).not.toHaveBeenCalled()
    expect(repo.markRepaired).not.toHaveBeenCalled()
  })

  it("refuses an oversized note", async () => {
    await expect(repair("person@example.com", "staff-sub", "x".repeat(501))).rejects.toThrow(/500/)
  })

  it("refuses to repair an address with no record", async () => {
    repo.getStatus.mockResolvedValue(null)
    await expect(repair("nobody@example.com", "staff-sub", "note")).rejects.toThrow(/no delivery record/)
  })

  it("records the PREVIOUS state in the audit detail", async () => {
    await repair("person@example.com", "staff-sub", "mailbox restored")
    expect(repo.markRepaired).toHaveBeenCalledWith(
      "person@example.com",
      "undeliverable",
      "staff-sub",
      "mailbox restored",
    )
  })
})
