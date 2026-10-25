/**
 * Every sign-in security decision, pure and free of AWS. Cognito enforces no attempt or retry limits
 * for a custom challenge, so these functions are the defence.
 */

import { randomInt } from "node:crypto";
import { CUSTOM_CHALLENGE, type ChallengeResult } from "./types.js";
import { decodeEnvelope, digestCode, digestsMatch, type CodeEnvelope } from "./codec.js";

/** Constants, not environment variables: widening a rate limit should need a code review. */
export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_SENDS_PER_HOUR = 20;

const DIGITS = /^[0-9]+$/;

/** A zero-padded string from the csprng, never a number, so it can never lose a leading zero. */
export function generateCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/** Exactly six digits; anything else is refused rather than reshaped. */
export function isWellFormedCode(value: string): boolean {
  return value.length === OTP_LENGTH && DIGITS.test(value);
}

/** Strips surrounding whitespace only: a longer or separated code is refused, never reshaped. */
export function normalizeAnswer(raw: string): string {
  return raw.trim();
}

export function attemptCount(session: readonly ChallengeResult[]): number {
  return session.filter((s) => s.challengeName === CUSTOM_CHALLENGE).length;
}

/** Every session element must be a challenge we authored, or tokens could issue for a foreign one. */
export function sessionIsOurs(session: readonly ChallengeResult[]): boolean {
  return session.every((s) => s.challengeName === CUSTOM_CHALLENGE);
}

export type NextStep =
  | { readonly kind: "issue-challenge" }
  | { readonly kind: "issue-tokens" }
  | { readonly kind: "fail" };

/**
 * `attempts >= OTP_MAX_ATTEMPTS` gives exactly three tries (asserted by test). `userNotFound` never
 * short-circuits, so unknown users walk the identical path.
 */
export function decideNextStep(
  session: readonly ChallengeResult[],
  userNotFound: boolean,
): NextStep {
  const ours = sessionIsOurs(session);
  const attempts = attemptCount(session);
  const last = session[session.length - 1];

  // The cap before success: a session with more answers than we offered is refused outright.
  if (!ours || attempts > OTP_MAX_ATTEMPTS) {
    return { kind: "fail" };
  }

  // Success is still allowed on the final attempt, hence `>` above and `>=` below.
  if (
    last !== undefined &&
    last.challengeName === CUSTOM_CHALLENGE &&
    last.challengeResult === true &&
    !userNotFound
  ) {
    return { kind: "issue-tokens" };
  }

  if (attempts >= OTP_MAX_ATTEMPTS) {
    return { kind: "fail" };
  }

  return { kind: "issue-challenge" };
}

export type AnswerVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "malformed" | "expired" | "mismatch" | "no-envelope" };

/**
 * The code's TTL is enforced here (AuthSessionValidity refreshes every round trip). The compare is
 * constant-time and runs on every path with an envelope, unknown users included.
 */
export function verifyAnswer(args: {
  readonly answer: string;
  readonly envelope: CodeEnvelope | null;
  readonly key: string;
  readonly nowSeconds: number;
}): AnswerVerdict {
  const { answer, envelope, key, nowSeconds } = args;

  if (!envelope) return { ok: false, reason: "no-envelope" };
  if (!isWellFormedCode(answer)) return { ok: false, reason: "malformed" };

  const submitted = digestCode(answer, key);
  const matches = digestsMatch(submitted, envelope.digest);

  // Expiry after the compare, so an expired code is not answered faster than a wrong one.
  if (nowSeconds > envelope.issuedAt + OTP_TTL_SECONDS) {
    return { ok: false, reason: "expired" };
  }

  return matches ? { ok: true } : { ok: false, reason: "mismatch" };
}

/** `null` on a session's first invocation, when the caller generates a code. */
export function envelopeFromSession(session: readonly ChallengeResult[]): CodeEnvelope | null {
  const last = session[session.length - 1];
  if (!last || last.challengeName !== CUSTOM_CHALLENGE) return null;
  return decodeEnvelope(last.challengeMetadata);
}

/** Returned to the client, so the local part keeps at most its first character. */
export function maskDestination(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = local.length > 0 ? local[0] : "";
  return `${head}${"•".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}
