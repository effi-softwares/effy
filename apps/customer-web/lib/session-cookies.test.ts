import { describe, expect, it } from "vitest"

import { jwtExpiry } from "./session-cookies"

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")

describe("jwtExpiry", () => {
  it("reads the expiry of a token", () => {
    expect(jwtExpiry(`h.${b64({ exp: 1_800_000_000 })}.s`)).toBe(1_800_000_000)
  })

  it("answers null for anything that is not a token with an expiry", () => {
    expect(jwtExpiry(undefined)).toBeNull()
    expect(jwtExpiry("")).toBeNull()
    expect(jwtExpiry("not-a-token")).toBeNull()
    expect(jwtExpiry("h.%%%.s")).toBeNull()
    expect(jwtExpiry(`h.${b64({ sub: "s" })}.s`)).toBeNull()
    expect(jwtExpiry(`h.${b64({ exp: "soon" })}.s`)).toBeNull()
  })
})
