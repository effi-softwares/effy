import { describe, expect, it } from "vitest"

import type { AuthedEvent } from "@effy/edge-shared"

import { ACCESS_TOKEN_HEADER, requireCaller, TokenMismatchError } from "./identity"

/** A JWT whose payload carries `sub`. Unsigned — we only ever DECODE it, never verify it here. */
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

describe("requireCaller — the two-token guard (FR-035, research R12)", () => {
  it("accepts a matched pair", () => {
    const caller = requireCaller(event("sub-alice", tokenFor("sub-alice")))
    expect(caller.sub).toBe("sub-alice")
  })

  /**
   * ⚠⚠ THE TEST THIS FILE EXISTS FOR. ⚠⚠
   *
   * The attack: present a VICTIM's ID token (which the gateway verifies, and which selects the
   * victim's DATABASE ROW) paired with the ATTACKER's OWN access token (which selects the attacker's
   * COGNITO USER).
   *
   * Without this check the platform sets the ATTACKER's password while writing `has_password = true`
   * onto the VICTIM's record. The victim is not taken over — but their record now lies, so the
   * account page demands a "current password" they have never had, forever, and nothing anywhere
   * logs an error.
   *
   * One equality check closes the whole class.
   */
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
