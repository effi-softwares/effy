import type { AuthedEvent } from "@effy/edge-shared"
import { subject } from "@effy/edge-shared"

/**
 * The gateway verifies the ID token (`Authorization`); Cognito's password and attribute APIs need the
 * access token (`X-Effy-Access-Token`). Their `sub`s must match, or a victim's ID token paired with an
 * attacker's access token would set the attacker's password and corrupt the victim's record. The
 * access token's signature is not checked here: Cognito rejects a forged one.
 */

export const ACCESS_TOKEN_HEADER = "x-effy-access-token"

export class TokenMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TokenMismatchError"
  }
}

export interface CallerIdentity {
  /** The gateway-verified subject; everything keys on this. */
  sub: string
  /** For relaying to Cognito. Never logged. */
  accessToken: string
}

/** @throws TokenMismatchError: the handler must answer 401 and stop. */
export function requireCaller(event: AuthedEvent): CallerIdentity {
  const sub = subject(event)
  if (!sub) throw new TokenMismatchError("no verified subject on the request")

  const accessToken = header(event, ACCESS_TOKEN_HEADER)
  if (!accessToken) throw new TokenMismatchError("no access token presented")

  const accessSub = decodeSub(accessToken)
  if (!accessSub) throw new TokenMismatchError("the access token carries no subject")

  // The gateway authenticated the ID token, never this one.
  if (accessSub !== sub) {
    throw new TokenMismatchError("the access token does not belong to the authenticated subject")
  }

  return { sub, accessToken }
}

function header(event: AuthedEvent, name: string): string | undefined {
  // HTTP API lowercases header names, but do not depend on it.
  const headers = event.headers ?? {}
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === name && typeof v === "string" && v.length > 0) return v
  }
  return undefined
}

/** Decoded, not verified: used only to compare with the verified subject. */
function decodeSub(token: string): string | undefined {
  const parts = token.split(".")
  if (parts.length !== 3) return undefined
  try {
    const json = Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    )
    const payload = JSON.parse(json) as Record<string, unknown>
    return typeof payload.sub === "string" ? payload.sub : undefined
  } catch {
    return undefined
  }
}

