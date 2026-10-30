// Breached-password screening by k-anonymity. Backend-only: a browser check is not a control. Runs on
// every path that sets a password (set, change, recovery-confirm); Cognito does not screen.

import { logger } from "./logger";

/** Takes a prefix, never a password. */
const RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range";

/** We fail closed, so the service must not hang the request. */
const TIMEOUT_MS = 2_500;

export class BreachCheckUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("breach screening is unavailable");
    this.name = "BreachCheckUnavailableError";
    this.cause = cause;
  }
}

/**
 * The password never leaves this process: SHA-1 it (the corpus index, not a password hash; do not
 * "upgrade"), send only the first 5 hex characters, match the returned suffixes locally.
 * `Add-Padding: true` keeps response sizes uniform.
 * @throws BreachCheckUnavailableError: the caller must refuse the password.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  const digest = await sha1Hex(password);
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);

  let body: string;
  try {
    const res = await fetch(`${RANGE_ENDPOINT}/${prefix}`, {
      // Uniform response size defeats traffic analysis.
      headers: { "Add-Padding": "true", "User-Agent": "effy-edge-customer" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`breach service responded ${res.status}`);
    body = await res.text();
  } catch (err) {
    // Fail closed: a password is optional on Effy, so an outage costs "come back later" while failing open
    // would accept a breached password.
    logger.error({ err }, "breach screening unavailable - refusing the password (fail-closed)");
    throw new BreachCheckUnavailableError(err);
  }

  // `SUFFIX:COUNT` per line, uppercase.
  for (const line of body.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    if (line.slice(0, sep).trim() === suffix) return true;
  }
  return false;
}

/** Uppercase hex via Web Crypto. Never log the input, digest or prefix. */
async function sha1Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
