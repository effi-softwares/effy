import { beforeEach, describe, expect, it, vi } from "vitest"

const draft = vi.hoisted(() => ({ enable: vi.fn(), disable: vi.fn(), isEnabled: false }))
vi.mock("next/headers", () => ({ draftMode: async () => draft }))

import { GET } from "./route"
import { POST } from "./exit/route"

beforeEach(() => vi.clearAllMocks())

const call = (url: string) => GET(new Request(url))

describe("entering a preview", () => {
  it("enables the draft session and carries the token", async () => {
    const res = await call("https://shop.test/api/preview?token=abc.def")

    expect(draft.enable).toHaveBeenCalled()
    expect(res.headers.get("location")).toBe("https://shop.test/")
    expect(res.cookies.get("effy_preview_token")?.value).toBe("abc.def")
  })

  it("refuses a request with no token rather than enabling an empty session", async () => {
    // ⚠ Draft mode with no token is a half-state: the page would ask the hot path for a draft it
    // cannot prove it may see, get published content back, and show a preview banner over the live
    // page. Refusing here keeps that state unreachable from the front door.
    const res = await call("https://shop.test/api/preview")
    expect(res.status).toBe(400)
    expect(draft.enable).not.toHaveBeenCalled()
  })

  /**
   * ⚠ THE OPEN-REDIRECT PROOF (T074).
   *
   * The obvious convenience — `?redirect=/wherever` — would be an unusually valuable open redirect
   * here: the attacker's link ENABLES A DRAFT SESSION first and then bounces the operator wherever it
   * likes, on a domain they trust and have just authenticated against. There is exactly one page with
   * a preview, so there is nothing to parameterise, and these assert that nothing in the request can
   * move the destination.
   */
  it("ignores every parameter that could steer the redirect", async () => {
    for (const q of [
      "&redirect=https://evil.test",
      "&redirect=//evil.test",
      "&next=https://evil.test",
      "&returnTo=/../../evil",
      "&url=https%3A%2F%2Fevil.test",
      "&redirect=/%2F%2Fevil.test",
    ]) {
      const res = await call(`https://shop.test/api/preview?token=t${q}`)
      expect(res.headers.get("location"), `"${q}" moved the redirect`).toBe("https://shop.test/")
    }
  })

  it("keeps the token out of client script and scopes it to the site", () => {
    // Nothing in the browser needs to read this; it grants access to unpublished content.
    return call("https://shop.test/api/preview?token=abc").then((res) => {
      const cookie = res.cookies.get("effy_preview_token")
      expect(cookie?.httpOnly).toBe(true)
      expect(cookie?.path).toBe("/")
      // ⚠ `lax`, not `strict`. The operator ARRIVES from another origin — the back office — and
      // `strict` would drop the cookie on exactly that navigation, which is the one this serves.
      expect(cookie?.sameSite).toBe("lax")
      // The cookie must not outlive the token it carries, or the operator sits in a session that
      // silently shows published content — the failure preview exists to prevent.
      expect(cookie?.maxAge).toBe(15 * 60)
    })
  })
})

describe("leaving a preview", () => {
  it("disables the session and clears the token", async () => {
    const res = await POST(new Request("https://shop.test/api/preview/exit", { method: "POST" }))

    expect(draft.disable).toHaveBeenCalled()
    expect(res.headers.get("location")).toBe("https://shop.test/")
    expect(res.cookies.get("effy_preview_token")?.value).toBe("")
  })

  /**
   * ⚠ 303, NOT 307. A 307 preserves the method, so the browser would repeat the POST at the
   * destination — which is not what "take me back to the ordinary page" means, and would re-run the
   * exit against the home route.
   */
  it("redirects with a status that makes the browser follow with a GET", async () => {
    const res = await POST(new Request("https://shop.test/api/preview/exit", { method: "POST" }))
    expect(res.status).toBe(303)
  })

  /**
   * ⚠ THE EXIT IS POST-ONLY, AND THAT IS LOAD-BEARING. Next prefetches links on hover and on viewport
   * entry — a GET exit would end the session before the operator clicked it, snapping the page back
   * to published while they were still reading the draft. It would present as the preview randomly
   * expiring and reproduce only by hovering.
   */
  it("exposes no GET handler at all", async () => {
    const mod = (await import("./exit/route")) as Record<string, unknown>
    expect(mod.GET).toBeUndefined()
  })
})
