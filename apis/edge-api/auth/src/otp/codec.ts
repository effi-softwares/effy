/**
 * `challengeMetadata` is the only channel between CreateAuthChallenge invocations, so a mistyped code
 * can be retried without a new email. Unlike aws's sample it carries a keyed hash, never the code:
 * the value round-trips through the client's Session.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Bumping this invalidates in-flight codes. */
const VERSION = "v1";

export interface CodeEnvelope {
  /** Epoch seconds, set on the first invocation. */
  readonly issuedAt: number;
  /** Lowercase hex HMAC-SHA256. Never the code. */
  readonly digest: string;
}

export function digestCode(code: string, key: string): string {
  return createHmac("sha256", key).update(code, "utf8").digest("hex");
}

/** Keep it to a timestamp and a keyed hash: a client might one day read it. */
export function encodeEnvelope(envelope: CodeEnvelope): string {
  return `${VERSION}:${envelope.issuedAt}:${envelope.digest}`;
}

/** `null` on any malformed input, so it degrades to a fresh challenge, never a relayed error. */
export function decodeEnvelope(raw: string | undefined): CodeEnvelope | null {
  if (!raw) return null;

  const parts = raw.split(":");
  if (parts.length !== 3) return null;

  const [version, issuedAtRaw, digest] = parts;
  if (version !== VERSION) return null;
  if (!issuedAtRaw || !digest) return null;

  // A plain positive integer only: `Number` accepts "1e9", " 12 " and "0x10".
  if (!/^[0-9]+$/.test(issuedAtRaw)) return null;
  if (!/^[0-9a-f]{64}$/.test(digest)) return null;

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) return null;

  return { issuedAt, digest };
}

/** Constant-time. The explicit length check avoids `timingSafeEqual` throwing. */
export function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
