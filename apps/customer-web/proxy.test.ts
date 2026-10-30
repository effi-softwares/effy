// @vitest-environment node
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const refreshTokens = vi.fn()
vi.mock("@/lib/cognito", () => ({ refreshTokens: (t: string) => refreshTokens(t) }))

import { proxy } from "./proxy"

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")
const token = (exp: number) => `${b64({ alg: "RS256" })}.${b64({ sub: "s", exp })}.sig`
const now = () => Math.floor(Date.now() / 1000)

function request(path: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ")
  return new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} })
}

beforeEach(() => {
  refreshTokens.mockReset()
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000")
})

describe("the request proxy", () => {
  it("lets a guest browse, and never calls Cognito for one", async () => {
    const res = await proxy(request("/"))
    expect(res.headers.get("location")).toBeNull()
    expect(refreshTokens).not.toHaveBeenCalled()
  })

  it("sends a guest to sign-in from an account page, keeping where they were going", async () => {
    const res = await proxy(request("/orders/42?tab=items"))
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?next=%2Forders%2F42%3Ftab%3Ditems",
    )
  })

  it("does not treat a look-alike path as protected", async () => {
    const res = await proxy(request("/accounting"))
    expect(res.headers.get("location")).toBeNull()
  })

  it("passes a current session through untouched", async () => {
    const res = await proxy(request("/account", { effy_id: token(now() + 3600), effy_rt: "r" }))
    expect(res.headers.get("location")).toBeNull()
    expect(refreshTokens).not.toHaveBeenCalled()
  })

  it("⚠ swaps expired tokens for fresh ones - for this render AND for the browser", async () => {
    const fresh = { idToken: token(now() + 3600), accessToken: "new-access" }
    refreshTokens.mockResolvedValue(fresh)
    const res = await proxy(request("/account", { effy_id: token(now() - 10), effy_rt: "r" }))
    expect(refreshTokens).toHaveBeenCalledWith("r")
    expect(res.headers.get("location")).toBeNull()
    expect(res.cookies.get("effy_id")?.value).toBe(fresh.idToken)
    expect(res.cookies.get("effy_at")).toMatchObject({ value: "new-access", httpOnly: true })
    // The refreshed cookie is forwarded to the page being rendered.
    expect(res.headers.get("x-middleware-request-cookie")).toContain(fresh.idToken)
  })

  it("refreshes a little BEFORE expiry, so a token cannot lapse on the way to the backend", async () => {
    refreshTokens.mockResolvedValue({ idToken: token(now() + 3600), accessToken: "a" })
    await proxy(request("/", { effy_id: token(now() + 20), effy_rt: "r" }))
    expect(refreshTokens).toHaveBeenCalledTimes(1)
  })

  it("ends the session when Cognito refuses the refresh token", async () => {
    refreshTokens.mockResolvedValue(null)
    const res = await proxy(request("/account", { effy_id: token(now() - 10), effy_rt: "r" }))
    expect(res.headers.get("location")).toContain("/sign-in?next=%2Faccount")
    expect(res.cookies.get("effy_rt")?.value).toBe("")
    expect(res.cookies.get("effy_id")?.value).toBe("")
  })

  it("⚠ signs NOBODY out when Cognito cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => { })
    refreshTokens.mockRejectedValue(new Error("timeout"))
    const res = await proxy(request("/account", { effy_id: token(now() - 10), effy_rt: "r" }))
    expect(res.headers.get("location")).toBeNull()
    expect(res.cookies.get("effy_rt")).toBeUndefined()
  })
})
