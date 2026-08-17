import { beforeEach, describe, expect, it, vi } from "vitest"

const repo = {
  list: vi.fn(),
  getByReference: vi.fn(),
  listReplies: vi.fn(),
  listNotes: vi.fn(),
  updateStatus: vi.fn(),
  insertNote: vi.fn(),
  insertReplyAndMarkReplied: vi.fn(),
}
const sendEmail = vi.fn()

vi.mock("./repository", () => repo)
vi.mock("@effy/email-kit/send", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }))
vi.mock("@effy/edge-shared", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { addNote, changeStatus, detail, list, reply } = await import("./service")
const { FeedbackError } = await import("./types")

const actor = { sub: "staff-1", name: "Alex Ops" }

function row(overrides: Record<string, unknown> = {}) {
  return {
    reference_code: "FB-ABC123",
    category: "suggestion",
    status: "new",
    rating: 4,
    message: "Add dark mode <script>x</script>",
    submitter_name: "Sam",
    submitter_email: "sam@example.com",
    email_verified: false,
    customer_id: null,
    source: "general",
    platform: "web",
    created_at: new Date("2026-08-16T00:00:00Z"),
    updated_at: new Date("2026-08-16T01:00:00Z"),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sendEmail.mockResolvedValue(undefined)
})

describe("list — shapes rows into DTOs with a truncated preview", () => {
  it("maps guest vs customer and truncates a long message", async () => {
    repo.list.mockResolvedValue({
      items: [row({ message: "x".repeat(200), customer_id: null }), row({ customer_id: "c1" })],
      total: 2,
    })
    const dto = await list({
      q: null, category: null, status: null, rating: null, from: null, to: null, limit: 25, offset: 0,
    })
    expect(dto.total).toBe(2)
    expect(dto.items[0]!.preview.endsWith("…")).toBe(true)
    expect(dto.items[0]!.preview.length).toBeLessThanOrEqual(141)
    expect(dto.items[0]!.submitter.kind).toBe("guest")
    expect(dto.items[1]!.submitter.kind).toBe("customer")
    expect(dto.nextCursor).toBeNull()
  })

  it("returns a nextCursor when more remain", async () => {
    repo.list.mockResolvedValue({ items: [row()], total: 5 })
    const dto = await list({
      q: null, category: null, status: null, rating: null, from: null, to: null, limit: 1, offset: 0,
    })
    expect(dto.nextCursor).toBe("1")
  })
})

describe("detail — full context + replies + notes; 404 when absent", () => {
  it("includes the raw full message and canReply based on the email", async () => {
    repo.getByReference.mockResolvedValue(row())
    repo.listReplies.mockResolvedValue([
      { body: "Thanks!", staff_name: "Alex", sent_at: new Date("2026-08-16T02:00:00Z") },
    ])
    repo.listNotes.mockResolvedValue([])
    const dto = await detail("FB-ABC123")
    expect(dto.message).toContain("<script>") // raw; inertness is a render-time property
    expect(dto.canReply).toBe(true)
    expect(dto.replies).toHaveLength(1)
  })

  it("canReply is false without a submitter email", async () => {
    repo.getByReference.mockResolvedValue(row({ submitter_email: null }))
    repo.listReplies.mockResolvedValue([])
    repo.listNotes.mockResolvedValue([])
    expect((await detail("FB-ABC123")).canReply).toBe(false)
  })

  it("throws not_found when there is no such submission", async () => {
    repo.getByReference.mockResolvedValue(null)
    await expect(detail("FB-NONE")).rejects.toMatchObject({ kind: "not_found" })
  })
})

describe("changeStatus — rejects a non-settable status; `replied` is not settable", () => {
  it("accepts an allowed status", async () => {
    repo.updateStatus.mockResolvedValue(true)
    await changeStatus("FB-ABC123", "resolved")
    expect(repo.updateStatus).toHaveBeenCalledWith("FB-ABC123", "resolved")
  })

  it("refuses `replied` (system-set only) and any garbage", async () => {
    for (const bad of ["replied", "nope", 3, null]) {
      await expect(changeStatus("FB-ABC123", bad)).rejects.toMatchObject({ kind: "validation" })
    }
    expect(repo.updateStatus).not.toHaveBeenCalled()
  })

  it("throws not_found when the update matches nothing", async () => {
    repo.updateStatus.mockResolvedValue(false)
    await expect(changeStatus("FB-NONE", "resolved")).rejects.toMatchObject({ kind: "not_found" })
  })
})

describe("addNote — validates length; attributes to the actor", () => {
  it("rejects an empty or oversized note", async () => {
    await expect(addNote("FB-ABC123", "   ", actor)).rejects.toMatchObject({ kind: "validation" })
    await expect(addNote("FB-ABC123", "x".repeat(2001), actor)).rejects.toMatchObject({ kind: "validation" })
    expect(repo.insertNote).not.toHaveBeenCalled()
  })

  it("inserts a valid note with the staff actor", async () => {
    repo.insertNote.mockResolvedValue(true)
    await addNote("FB-ABC123", "  looks like a real bug ", actor)
    expect(repo.insertNote).toHaveBeenCalledWith("FB-ABC123", "looks like a real bug", actor)
  })
})

describe("reply — email FIRST, write ONLY on success (FR-029/030)", () => {
  it("sends, then writes the reply and flips status to replied", async () => {
    repo.getByReference.mockResolvedValue(row())
    repo.insertReplyAndMarkReplied.mockResolvedValue(true)
    await reply("FB-ABC123", "Fixed it, thanks!", actor)

    expect(sendEmail).toHaveBeenCalledWith(
      "feedback-reply",
      expect.objectContaining({ replyBody: "Fixed it, thanks!", referenceCode: "FB-ABC123" }),
      { to: "sam@example.com", audience: "customer" },
      expect.anything(),
    )
    // ⚠ Ordering: the write happens after the send.
    expect(sendEmail.mock.invocationCallOrder[0]!).toBeLessThan(
      repo.insertReplyAndMarkReplied.mock.invocationCallOrder[0]!,
    )
  })

  it("refuses with conflict when there is no submitter email — and sends nothing", async () => {
    repo.getByReference.mockResolvedValue(row({ submitter_email: null }))
    await expect(reply("FB-ABC123", "hi", actor)).rejects.toMatchObject({ kind: "conflict" })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(repo.insertReplyAndMarkReplied).not.toHaveBeenCalled()
  })

  it("does NOT write when the send throws (submission never falsely marked replied)", async () => {
    repo.getByReference.mockResolvedValue(row())
    sendEmail.mockRejectedValue(new Error("SES down"))
    await expect(reply("FB-ABC123", "hi", actor)).rejects.toMatchObject({ kind: "send_failed" })
    expect(repo.insertReplyAndMarkReplied).not.toHaveBeenCalled()
  })

  it("rejects an empty or oversized reply before doing anything", async () => {
    await expect(reply("FB-ABC123", "  ", actor)).rejects.toMatchObject({ kind: "validation" })
    await expect(reply("FB-ABC123", "x".repeat(5001), actor)).rejects.toMatchObject({ kind: "validation" })
    expect(repo.getByReference).not.toHaveBeenCalled()
  })
})
