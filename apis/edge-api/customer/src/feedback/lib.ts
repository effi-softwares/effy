import { createHash, randomInt } from "node:crypto"

/**
 * Feedback helpers (046). Pure and testable — no I/O.
 */

// ⚠ Crockford base32 without the ambiguous letters (I, L, O, U). A reference the shopper may read off
// a screen or type into an email should not confuse 0/O or 1/I/L, and dropping U avoids accidental
// profanity. 6 chars over this 32-char alphabet ≈ 1.07e9 codes — ample, and the UNIQUE constraint on
// `reference_code` is the backstop against the rare collision (the caller retries).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/**
 * An opaque public reference like `FB-7K2Q9M`.
 *
 * ⚠ NOT sequential and NOT derived from the row id — a guessable/running reference is an enumeration
 * oracle (research D10). Drawn from a CSPRNG (`randomInt`), so two submissions a millisecond apart do
 * not collide by construction of a timestamp.
 */
export function generateReferenceCode(): string {
  let body = ""
  for (let i = 0; i < 6; i++) body += ALPHABET[randomInt(ALPHABET.length)]
  return `FB-${body}`
}

/**
 * The stored rate-limit key — a hash, NEVER the raw source.
 *
 * ⚠ THE POINT IS PII AVOIDANCE, NOT SECRECY. A submitter's IP is personal data (Principle VII), so it
 * must not be stored in the clear just to count submissions. `salt` is an optional deployment value
 * that widens the pre-image space a little; it is not a security secret and defaults to empty. The
 * authed path passes the `sub` (already non-PII) prefixed so it can never collide with an IP hash.
 */
export function sourceKey(rawSource: string, salt = ""): string {
  return createHash("sha256").update(`${salt}:${rawSource}`).digest("hex")
}

/** `sub:<cognitoSub>` — the authed rate-limit source, namespaced so it never collides with an IP. */
export function subSource(cognitoSub: string): string {
  return `sub:${cognitoSub}`
}

/** `ip:<addr>` — the guest rate-limit source, namespaced likewise. */
export function ipSource(sourceIp: string): string {
  return `ip:${sourceIp}`
}
