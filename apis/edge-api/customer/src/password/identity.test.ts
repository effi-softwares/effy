import { describe, expect, it } from "vitest"

import type { AuthedEvent } from "@effy/edge-shared"

import { ACCESS_TOKEN_HEADER, requireCaller, TokenMismatchError } from "./identity"

/** Unsigned: only ever decoded here. */
function tokenFor(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url")
  return `header.${payload}.signature`
}

function event(verifiedSub: string | undefined, accessToken?: string): AuthedEvent {
  return {
    headers: accessToken ? { [ACCESS_TOKEN_HEADER]: accessToken } : {},
    requestContext: {
      authorizer: { jwt: { claims: verifiedSub ? { sub: verifiedSub } : {} } },
    },
  } as unknown as AuthedEvent
}

describe("requireCaller - the two-token guard (FR-035, research R12)", () => {
  it("accepts a matched pair", () => {
    const caller = requireCaller(event("sub-alice", tokenFor("sub-alice")))
    expect(caller.sub).toBe("sub-alice")
  })

  /** A victim's ID token with the attacker's access token must be refused, or the victim's record would lie. */
  it("REFUSES a victim's ID token paired with an attacker's access token", () => {
    expect(() => requireCaller(event("sub-victim", tokenFor("sub-attacker")))).toThrow(
      TokenMismatchError,
    )
  })

  it("refuses a request with no access token at all", () => {
    expect(() => requireCaller(event("sub-alice"))).toThrow(TokenMismatchError)
  })

  it("refuses an access token that carries no subject", () => {
    const noSub = `header.${Buffer.from(JSON.stringify({ foo: 1 })).toString("base64url")}.sig`
    expect(() => requireCaller(event("sub-alice", noSub))).toThrow(TokenMismatchError)
  })

  it("refuses a malformed access token rather than falling through", () => {
    expect(() => requireCaller(event("sub-alice", "not-a-jwt"))).toThrow(TokenMismatchError)
  })

  it("refuses when the gateway verified no subject", () => {
    expect(() => requireCaller(event(undefined, tokenFor("sub-alice")))).toThrow(TokenMismatchError)
  })

  it("matches the header case-insensitively (the gateway lowercases, but do not depend on it)", () => {
    const e = {
      headers: { "X-Effy-Access-Token": tokenFor("sub-alice") },
      requestContext: { authorizer: { jwt: { claims: { sub: "sub-alice" } } } },
    } as unknown as AuthedEvent
    expect(requireCaller(e).sub).toBe("sub-alice")
  })
})
