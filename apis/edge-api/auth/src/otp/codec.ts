/**
 * `challengeMetadata` encoding (035 — research R1).
 *
 * ⚠ THE PROBLEM THIS SOLVES. When a shopper answers wrongly and `DefineAuthChallenge` re-issues
 * `CUSTOM_CHALLENGE`, Cognito invokes `CreateAuthChallenge` AGAIN — with an empty response object.
 * `privateChallengeParameters` is response-only; it does not appear on the request side and it does
 * not persist. `request.session[].challengeMetadata` is the ONLY channel that carries anything from
 * one invocation to the next.
 *
 * So a flow that lets someone mistype without re-mailing them a fresh code MUST round-trip
 * something through here.
 *
 * ⚠ AND WHY WE DIVERGE FROM AWS'S OWN SAMPLE. `aws-samples/amazon-cognito-passwordless-email-auth`
 * writes `challengeMetadata = \`CODE-${secretLoginCode}\`` — the CLEARTEXT code. Two reasons not to:
 *   1. FR-014 requires hash-only storage, and this string is storage.
 *   2. `challengeMetadata` round-trips through the client's `Session` string. The InitiateAuth and
 *      RespondToAuthChallenge response schemas carry no field for it, and the Session value decodes
 *      to an AWS-Encryption-SDK/KMS envelope — but NO AWS PAGE STATES AS A POSITIVE FACT that it is
 *      withheld from the client. Designing so the answer does not matter costs nothing.
 *
 * A leak of this string therefore exposes a keyed hash of a 5-minute, 3-attempt secret — not a code.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Bumping this invalidates in-flight codes by design — an old-format token simply fails to parse. */
const VERSION = "v1";

export interface CodeEnvelope {
  /** Epoch seconds at which the code was generated. Set once, on the first invocation. */
  readonly issuedAt: number;
  /** Lowercase hex HMAC-SHA256 of the code. ⚠ Never the code. */
  readonly digest: string;
}

/** HMAC a code with the service key. Exported because both encode and verify need the same one. */
export function digestCode(code: string, key: string): string {
  return createHmac("sha256", key).update(code, "utf8").digest("hex");
}

/**
 * Serialise for `response.challengeMetadata`.
 * ⚠ Anything added here becomes something a client might one day be able to read. Keep it to a
 * timestamp and a keyed hash.
 */
export function encodeEnvelope(envelope: CodeEnvelope): string {
  return `${VERSION}:${envelope.issuedAt}:${envelope.digest}`;
}

/**
 * Parse a previous invocation's `challengeMetadata`.
 *
 * Returns `null` rather than throwing on ANY malformed input — a corrupt or unrecognised envelope
 * must degrade to "issue a fresh challenge", never to a 500 whose text Cognito would relay to the
 * caller verbatim.
 */
export function decodeEnvelope(raw: string | undefined): CodeEnvelope | null {
  if (!raw) return null;

  const parts = raw.split(":");
  if (parts.length !== 3) return null;

  const [version, issuedAtRaw, digest] = parts;
  if (version !== VERSION) return null;
  if (!issuedAtRaw || !digest) return null;

  // Reject anything that is not a plain positive integer. `Number()` alone would accept
  // "1e9", " 12 " and "0x10"; none of those are timestamps we wrote.
  if (!/^[0-9]+$/.test(issuedAtRaw)) return null;
  if (!/^[0-9a-f]{64}$/.test(digest)) return null;

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) return null;

  return { issuedAt, digest };
}

/**
 * Constant-time digest comparison (FR-015).
 *
 * ⚠ `timingSafeEqual` THROWS on length mismatch, which would itself be a timing/behaviour oracle.
 * Both operands here are fixed-width hex from `digestCode`, but a malformed stored value could
 * still reach this, so the length check is explicit and the buffers are built the same way on both
 * sides.
 */
export function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
