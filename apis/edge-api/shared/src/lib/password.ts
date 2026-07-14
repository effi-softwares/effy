// Breached-password screening (012 FR-022 / FR-022a), via k-anonymity.
//
// ⚠ THIS MODULE IS BACKEND-ONLY, AND THAT IS THE POINT.
//
// The length rule lives in @effy/shared-types and is shared with the browser, because instant
// "too short" feedback is a courtesy worth giving. THIS check is different: it is a CONTROL, and a
// control that runs in the browser is not a control — a crafted request simply skips it. So it runs
// here, on the server, on EVERY path that establishes a password (set · change · recovery-confirm),
// and there is no client-side copy to bypass (research R9).
//
// WHY IT EXISTS AT ALL: Cognito does not screen against breach corpora, and never will. Without
// this, a customer can pick a password that appears in a billion-record dump and the platform has no
// idea. That is the exact fuel credential-stuffing runs on. NIST SP 800-63B-4 requires the screening;
// the pool cannot do it; therefore we do.

import { logger } from "./logger";

/** api.pwnedpasswords.com — the range endpoint takes a PREFIX, never a password. */
const RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range";

/** The breach service is slow-ish and we are fail-closed; do not let it hang the whole request. */
const TIMEOUT_MS = 2_500;

export class BreachCheckUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("breach screening is unavailable");
    this.name = "BreachCheckUnavailableError";
    this.cause = cause;
  }
}

/**
 * Is this password known to have been exposed in a public breach?
 *
 * ⚠ THE PASSWORD NEVER LEAVES THIS PROCESS. That is not a nicety — sending a user's chosen password
 * to a third party to ask whether it is safe would be a spectacular own-goal.
 *
 * K-ANONYMITY, precisely:
 *   1. SHA-1 the password locally.                      (SHA-1 is correct here. It is the corpus's
 *                                                        index, not a password hash — Cognito does
 *                                                        the actual credential hashing. Do not
 *                                                        "upgrade" this to SHA-256; it would simply
 *                                                        stop matching anything.)
 *   2. Send ONLY the first 5 hex characters of the digest.
 *   3. Receive every suffix sharing that prefix (~500–1000 of them) and match LOCALLY.
 *
 * The service therefore learns a 5-character prefix shared by tens of thousands of passwords, and
 * learns nothing about which one is ours. `Add-Padding: true` makes every response a uniform size,
 * so the *length* of the reply cannot leak the prefix either.
 *
 * @throws BreachCheckUnavailableError — the caller MUST refuse the password. See below.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  const digest = await sha1Hex(password);
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);

  let body: string;
  try {
    const res = await fetch(`${RANGE_ENDPOINT}/${prefix}`, {
      // Uniform response size — defeats the traffic analysis that could otherwise recover the prefix.
      headers: { "Add-Padding": "true", "User-Agent": "effy-edge-customer" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`breach service responded ${res.status}`);
    body = await res.text();
  } catch (err) {
    // ⚠ FAIL CLOSED — we throw, and the caller REFUSES the password.
    //
    // Most systems fail open here, reasoning that blocking a password change during a third-party
    // outage is user-hostile. On Effy that reasoning does not hold: a password is an OPTIONAL
    // convenience. A customer blocked by an outage can still sign in with an emailed code — which is
    // the safer route anyway. So the cost of failing closed is "come back in ten minutes", and the
    // cost of failing open is "we shipped a breached password and told the customer it was fine".
    //
    // On a password-MANDATORY product this call would go the other way. It is a product fact, not a
    // technical one (research R8 / FR-022a).
    logger.error({ err }, "breach screening unavailable — refusing the password (fail-closed)");
    throw new BreachCheckUnavailableError(err);
  }

  // The response is `SUFFIX:COUNT` per line, suffixes uppercase.
  for (const line of body.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    if (line.slice(0, sep).trim() === suffix) return true;
  }
  return false;
}

/**
 * SHA-1, hex, uppercase — via Web Crypto, which Node 22 has natively.
 *
 * ⚠ Never log the input, the digest, or the prefix. The digest is a password equivalent for anyone
 * holding a rainbow table, and the prefix in a log next to a customer id narrows the search space
 * for no reason at all (FR-039).
 */
async function sha1Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
