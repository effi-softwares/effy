import { beforeEach, describe, expect, it, vi } from "vitest"

const authedPost = vi.fn()
const publicPost = vi.fn()
const getSession = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/api/edge", () => ({
  edgeApi: () => ({ post: authedPost }),
  edgeApiPublic: () => ({ post: publicPost }),
  perCustomer: { cache: "no-store" },
}))
vi.mock("@/lib/dal", () => ({
  getSession: () => getSession(),
}))

const { submitFeedbackAction } = await import("./actions")

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const valid = { category: "suggestion", message: "Add dark mode", source: "general" }

beforeEach(() => {
  vi.clearAllMocks()
  authedPost.mockResolvedValue({ status: "ok", referenceCode: "FB-AUTH01" })
  publicPost.mockResolvedValue({ status: "ok", referenceCode: "FB-GUEST1" })
  getSession.mockResolvedValue(null)
})

describe("submitFeedbackAction — re-validates on the server", () => {
  it("rejects an unknown category and a blank message without any request", async () => {
    expect(await submitFeedbackAction(null, form({ ...valid, category: "rant" }))).toEqual({
      status: "invalid",
      field: "category",
    })
    expect(await submitFeedbackAction(null, form({ ...valid, message: "   " }))).toEqual({
      status: "invalid",
      field: "message",
    })
    expect(authedPost).not.toHaveBeenCalled()
    expect(publicPost).not.toHaveBeenCalled()
  })
})

describe("submitFeedbackAction — the route is chosen by the SESSION, not the body", () => {
  it("posts a guest to the PUBLIC route with the body email", async () => {
    const r = await submitFeedbackAction(null, form({ ...valid, email: "guest@example.com" }))
    expect(r).toEqual({ status: "ok", referenceCode: "FB-GUEST1" })
    expect(publicPost).toHaveBeenCalledWith(
      "/customer/v1/feedback/public",
      expect.objectContaining({ email: "guest@example.com", platform: "web" }),
      expect.anything(),
    )
    expect(authedPost).not.toHaveBeenCalled()
  })

  it("posts a signed-in shopper to the AUTHED route and never forwards a body email", async () => {
    getSession.mockResolvedValue({ sub: "s", idToken: "id", accessToken: "ac" })
    const r = await submitFeedbackAction(null, form({ ...valid, email: "spoof@evil.com" }))
    expect(r).toEqual({ status: "ok", referenceCode: "FB-AUTH01" })
    const body = authedPost.mock.calls[0]![1]
    expect(authedPost.mock.calls[0]![0]).toBe("/customer/v1/feedback")
    expect(body).not.toHaveProperty("email")
    expect(publicPost).not.toHaveBeenCalled()
  })

  it("only forwards a valid rating", async () => {
    await submitFeedbackAction(null, form({ ...valid, rating: "4" }))
    expect(publicPost.mock.calls[0]![1]).toMatchObject({ rating: 4 })

    vi.clearAllMocks()
    getSession.mockResolvedValue(null)
    publicPost.mockResolvedValue({ status: "ok", referenceCode: "x" })
    await submitFeedbackAction(null, form({ ...valid, rating: "9" }))
    expect(publicPost.mock.calls[0]![1]).not.toHaveProperty("rating")
  })

  it("records the checkout source when passed", async () => {
    await submitFeedbackAction(null, form({ ...valid, source: "checkout" }))
    expect(publicPost.mock.calls[0]![1]).toMatchObject({ source: "checkout" })
  })
})

describe("submitFeedbackAction — maps HTTP failures to the shared result (never rethrows)", () => {
  it("maps 400 → invalid, 429 → rate_limited, other → error", async () => {
    publicPost.mockRejectedValueOnce({ status: 400 })
    expect(await submitFeedbackAction(null, form(valid))).toEqual({ status: "invalid" })

    publicPost.mockRejectedValueOnce({ status: 429 })
    expect(await submitFeedbackAction(null, form(valid))).toEqual({ status: "rate_limited" })

    publicPost.mockRejectedValueOnce({ status: 503 })
    expect(await submitFeedbackAction(null, form(valid))).toEqual({ status: "error" })
  })
})
