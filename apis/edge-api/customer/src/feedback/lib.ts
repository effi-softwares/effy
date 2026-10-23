import { createHash, randomInt } from "node:crypto"

// Crockford base32 without I, L, O, U. Six characters ≈ 1.07e9 codes; the unique constraint catches a collision (the caller retries).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/** Like `FB-7K2Q9M`: random (csprng), never sequential, so it cannot be enumerated. */
export function generateReferenceCode(): string {
  let body = ""
  for (let i = 0; i < 6; i++) body += ALPHABET[randomInt(ALPHABET.length)]
  return `FB-${body}`
}

/** A hash, never the raw source (an IP is personal data). `salt` is optional and not a secret. */
export function sourceKey(rawSource: string, salt = ""): string {
  return createHash("sha256").update(`${salt}:${rawSource}`).digest("hex")
}

/** Namespaced so it never collides with an IP. */
export function subSource(cognitoSub: string): string {
  return `sub:${cognitoSub}`
}

export function ipSource(sourceIp: string): string {
  return `ip:${sourceIp}`
}
