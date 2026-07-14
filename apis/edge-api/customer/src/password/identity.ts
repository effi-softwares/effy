import type { AuthedEvent } from "@effy/edge-shared"
import { claim, subject } from "@effy/edge-shared"

/**
 * TWO TOKENS, AND THEIR `sub`s MUST MATCH (012 FR-035, research R12).
 *
 * ── Why two tokens at all ──────────────────────────────────────────────────────────────────────
 *
 * The gateway's JWT authorizer is configured with `audience = [app_client_id]`, which is the ID
 * token's shape — and the storefront has always sent the ID token. But every Cognito API this slice
 * needs (`ChangePassword`, `GetUserAttributeVerificationCode`, `VerifyUserAttribute`,
 * `GlobalSignOut`, `UpdateUserAttributes`) is authorized by the **access** token.
 *
 * So the storefront sends both:
 *
 *     Authorization:       Bearer <ID token>     ← the gateway verifies this
 *     X-Effy-Access-Token: <access token>        ← we relay this to Cognito
 *
 * ── Why this file exists ───────────────────────────────────────────────────────────────────────
 *
 * Because naively trusting the second header creates a MISMATCHED-PAIR bug, and it is subtle enough
 * to survive review:
 *
 *     An attacker presents a VICTIM's ID token (which the authorizer verifies, and which selects the
 *     victim's DATABASE ROW) paired with their OWN access token (which selects THEIR Cognito user).
 *
 *     Result: we set the ATTACKER's password, and write `has_password = true` onto the VICTIM's
 *     record. The victim is not taken over — but their record now lies, so the account page offers
 *     them "Change password" forever, demanding a password they have never had. They are locked out
 *     of their own account page's password section, permanently, and nothing anywhere logged an
 *     error.
 *
 * One equality check closes the entire class. It is a MUST in the contract, not a nicety.
 *
 * ⚠ We do NOT verify the access token's signature here, and that is deliberate rather than lazy:
 * the token is about to be handed to Cognito, which will reject it outright if it is forged,
 * expired, or from another pool. What Cognito CANNOT tell us is whether it belongs to the same
 * person the gateway just authenticated — and that is precisely the question below.
 */

/** The header the storefront carries the access token on. */
export const ACCESS_TOKEN_HEADER = "x-effy-access-token"

export class TokenMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TokenMismatchError"
  }
}

export interface CallerIdentity {
  /** The gateway-verified subject. THE identity — everything keys on this. */
  sub: string
  /** The customer's access token, for relaying to Cognito. Never logged. */
  accessToken: string
}

/**
 * Resolve the caller, or throw.
 *
 * @throws TokenMismatchError — the handler MUST answer 401 and MUST NOT proceed.
 */
export function requireCaller(event: AuthedEvent): CallerIdentity {
  const sub = subject(event)
  if (!sub) throw new TokenMismatchError("no verified subject on the request")

  const accessToken = header(event, ACCESS_TOKEN_HEADER)
  if (!accessToken) throw new TokenMismatchError("no access token presented")

  const accessSub = decodeSub(accessToken)
  if (!accessSub) throw new TokenMismatchError("the access token carries no subject")

  // ⚠ THE CHECK. Do not remove it, and do not "simplify" it away because "the gateway already
  // authenticated the request" — the gateway authenticated the ID TOKEN. It has never seen this one.
  if (accessSub !== sub) {
    throw new TokenMismatchError("the access token does not belong to the authenticated subject")
  }

  return { sub, accessToken }
}

function header(event: AuthedEvent, name: string): string | undefined {
  // API Gateway HTTP API lowercases header names, but do not depend on it.
  const headers = event.headers ?? {}
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === name && typeof v === "string" && v.length > 0) return v
  }
  return undefined
}

/**
 * Decode (NOT verify) a JWT's `sub`.
 *
 * The result is used for ONE thing: comparing it against the subject the gateway already verified.
 * It is never trusted on its own, and it never selects a database row — `sub` (the verified one)
 * does that. A forged access token buys an attacker nothing here: it either fails this comparison,
 * or it passes and is then rejected by Cognito.
 */
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

/** The verified email claim, required by the recovery + notification paths. */
export function callerEmail(event: AuthedEvent): string | undefined {
  return claim(event, "email")
}
