import { beforeEach, describe, expect, it, vi } from "vitest"

const post = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/api/edge", () => ({
  edgeApiPublic: () => ({ post }),
  perCustomer: { cache: "no-store" },
}))

const { subscribeToNewsletter } = await import("./actions")

const form = (email?: unknown) => {
  const fd = new FormData()
  if (email !== undefined) fd.set("email", email as string)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  post.mockResolvedValue(undefined)
})

describe("subscribeToNewsletter — re-validates on the server (FR-030)", () => {
  /**
   * ⚠ The form's `type="email" required` is a CONVENIENCE, not a control. Anything can POST to a
   * Server Action, so an empty or absent value must be refused here without reaching the backend.
   */
  it("rejects a missing or blank address without calling the edge API", async () => {
    expect(await subscribeToNewsletter(null, form())).toEqual({ status: "invalid" })
    expect(await subscribeToNewsletter(null, form(""))).toEqual({ status: "invalid" })
    expect(await subscribeToNewsletter(null, form("   "))).toEqual({ status: "invalid" })

    expect(post).not.toHaveBeenCalled()
  })

  it("trims what it forwards", async () => {
    await subscribeToNewsletter(null, form("  person@example.com  "))

    expect(post).toHaveBeenCalledWith(
      "/customer/v1/newsletter",
      { email: "person@example.com" },
      expect.anything(),
    )
  })
})

describe("subscribeToNewsletter — failure is distinguished correctly (FR-033)", () => {
  it("reports success when the backend accepts", async () => {
    expect(await subscribeToNewsletter(null, form("person@example.com"))).toEqual({ status: "ok" })
  })

  /**
   * ⚠ THE DISTINCTION THAT MATTERS. A 400 means the ADDRESS was refused; anything else means WE
   * failed. Collapsing them would tell a visitor their address is wrong when the service is simply
   * down — and they would sit there retyping a perfectly good address.
   */
  it("reports `invalid` for a 400 from the backend", async () => {
    post.mockRejectedValue({ status: 400 })

    expect(await subscribeToNewsletter(null, form("person@example.com"))).toEqual({
      status: "invalid",
    })
  })

  it("reports `error` for a 503, a timeout, or anything else", async () => {
    for (const failure of [{ status: 503 }, new Error("network"), { statusCode: 500 }, "boom"]) {
      post.mockRejectedValue(failure)
      expect(await subscribeToNewsletter(null, form("person@example.com"))).toEqual({
        status: "error",
      })
    }
  })

  /**
   * ⚠ NEVER RETHROW. An uncaught Server Action error replaces the page with an error boundary, which
   * would discard everything the visitor typed — the exact opposite of FR-033's "preserve the
   * visitor's input on failure".
   */
  it("never throws, whatever the backend does", async () => {
    post.mockRejectedValue(new Error("catastrophe"))

    await expect(subscribeToNewsletter(null, form("person@example.com"))).resolves.toBeDefined()
  })
})

describe("subscribeToNewsletter — the address never leaks (FR-042)", () => {
  /**
   * ⚠ A newsletter subscriber is not even an account holder, so their email is not "the auth subject
   * id" that Principle VII permits — it is plain PII. This pins that the action returns only a status
   * and carries nothing else back into the page.
   */
  it("returns a status and nothing else", async () => {
    const ok = await subscribeToNewsletter(null, form("person@example.com"))
    expect(Object.keys(ok)).toEqual(["status"])

    post.mockRejectedValue({ status: 503 })
    const failed = await subscribeToNewsletter(null, form("person@example.com"))
    expect(Object.keys(failed)).toEqual(["status"])
    expect(JSON.stringify(failed)).not.toContain("person@example.com")
  })

  /**
   * ⚠ The Server Action deliberately emits NO analytics event. `lib/telemetry.ts` is `"use client"`
   * and `capture()` returns early off the browser — and returns early in the browser too, because
   * PostHog has never been initialised on this surface (CLAUDE.md §033). A call here would be a no-op
   * that reads as measurement. The newsletter's real signal is the backend structured log.
   */
  it("imports no client telemetry", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const source = readFileSync(join(__dirname, "actions.ts"), "utf8")

    expect(source).not.toContain("lib/telemetry")
    expect(source).not.toContain("capture(")
  })
})
