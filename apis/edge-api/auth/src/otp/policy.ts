/**
 * ⚠ EVERY SECURITY DECISION IN THIS SLICE LIVES IN THIS FILE, and nothing in it touches AWS.
 *
 * That is deliberate. Going from an 8-digit service-managed code to a 6-digit self-managed one
 * shrinks the guess space a HUNDREDFOLD, and Cognito enforces none of the compensating limits for
 * us: there is no quota on custom-challenge attempts and none on RespondToAuthChallenge retries per
 * session. The per-user rate of 10 req/sec permits roughly 3,000 guesses inside one 5-minute code
 * lifetime against a 10^6 space.
 *
 * So the functions below ARE the defence, and they are pure so that they can be exhaustively
 * tested without an AWS account, a network, or a mock.
 *
 * See specs/035-six-digit-otp/research.md § R5 and contracts/auth-triggers.contract.md.
 */

import { randomInt } from "node:crypto";
import { CUSTOM_CHALLENGE, type ChallengeResult } from "./types.js";
import { decodeEnvelope, digestCode, digestsMatch, type CodeEnvelope } from "./codec.js";

/**
 * ⚠ CONSTANTS, NOT ENVIRONMENT VARIABLES — on purpose.
 * A rate limit that an env var can widen is a rate limit that an incident will widen, at 3am, by
 * someone who will not remember to put it back. Changing these is a code review.
 */
export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_SENDS_PER_HOUR = 5;

const DIGITS = /^[0-9]+$/;

/**
 * Generate a code (FR-001, FR-007).
 *
 * ⚠ RETURNS A STRING, AND THAT IS THE POINT. `randomInt(0, 1e6)` yields `7` about as often as it
 * yields `700000`; formatting it as a number somewhere downstream would silently produce a 1-digit
 * code roughly one time in a hundred thousand and a shopper who could never sign in. Zero-padding
 * at the source means the value is never a number in the first place.
 *
 * `randomInt` is CSPRNG-backed and rejection-samples internally, so the distribution is uniform —
 * `Math.random()` would be neither.
 */
export function generateCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/** Exactly six digits. Anything else is refused rather than reshaped (FR-004, FR-005). */
export function isWellFormedCode(value: string): boolean {
  return value.length === OTP_LENGTH && DIGITS.test(value);
}

/**
 * Normalise a submitted answer.
 *
 * ⚠ We strip surrounding whitespace ONLY. We deliberately do NOT strip inner separators or truncate
 * to the first six digits: an 8-digit value must be REFUSED, not quietly reshaped into something
 * that looks valid (FR-005). Silently trimming a longer code to six is precisely the shipped defect
 * this whole feature exists to fix.
 */
export function normalizeAnswer(raw: string): string {
  return raw.trim();
}

/** How many times the shopper has answered this session. */
export function attemptCount(session: readonly ChallengeResult[]): number {
  return session.filter((s) => s.challengeName === CUSTOM_CHALLENGE).length;
}

/**
 * ⚠ Is every element of this session one we authored?
 *
 * AWS is explicit: "always check `challengeName` in your define auth challenge function and verify
 * that it matches the expected value." A `DefineAuthChallenge` that only counts `session.length`
 * and reads `challengeResult` will happily issue tokens for a challenge type it never created.
 */
export function sessionIsOurs(session: readonly ChallengeResult[]): boolean {
  return session.every((s) => s.challengeName === CUSTOM_CHALLENGE);
}

export type NextStep =
  | { readonly kind: "issue-challenge" }
  | { readonly kind: "issue-tokens" }
  | { readonly kind: "fail" };

/**
 * The state machine (FR-011).
 *
 * ⚠ THE OFF-BY-ONE. `attempts >= OTP_MAX_ATTEMPTS` gives exactly THREE tries: sessions of length
 * 0, 1 and 2 each issue a challenge, and length 3 fails. Getting this wrong by one is the
 * difference between 3 attempts and 4 — a 33% larger brute-force budget, invisible in review.
 * It is asserted by test, not by reading.
 *
 * ⚠ `userNotFound` NEVER short-circuits. A phantom user walks the identical path with the identical
 * attempt count, or the number of round trips before refusal becomes an existence oracle (FR-016).
 */
export function decideNextStep(
  session: readonly ChallengeResult[],
  userNotFound: boolean,
): NextStep {
  const ours = sessionIsOurs(session);
  const attempts = attemptCount(session);
  const last = session[session.length - 1];

  // ⚠ ORDER IS LOAD-BEARING, AND GETTING IT WRONG IS A REAL BYPASS.
  //
  // An earlier version of this function checked SUCCESS first and the cap second. That let a
  // session of [wrong, wrong, wrong, correct] return `issue-tokens`: the fourth answer arrived
  // after the budget was spent, and a late correct guess bought tokens the cap was supposed to
  // deny. Cognito should never present a fourth answer — `fail` ends the flow — but "should never"
  // is not a control, and this is the authentication path.
  //
  // So: a session carrying MORE answers than we ever offered is refused outright, before any
  // success branch can look at it.
  if (!ours || attempts > OTP_MAX_ATTEMPTS) {
    return { kind: "fail" };
  }

  // Success is still allowed ON the final attempt — someone who gets it right on their third try
  // signs in. This is why the check above is `>` and the one below is `>=`.
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
 * Verify a submitted answer (FR-005, FR-008, FR-015).
 *
 * ⚠ TTL IS ENFORCED HERE, not by `AuthSessionValidity`. That setting bounds the Session token
 * between requests and is REFRESHED on every round trip, so it cannot express "this code dies five
 * minutes after it was issued". A shopper who answers slowly three times would otherwise keep a
 * code alive well past its intended life.
 *
 * ⚠ The comparison is constant-time and runs on EVERY path that has an envelope, including the
 * phantom-user path, so that timing does not distinguish "wrong code" from "no such account".
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

  // ⚠ Expiry is checked AFTER the compare, and the compare always runs. Checking expiry first
  // would return faster for an expired code than for a wrong one — a small timing channel, but a
  // free one to close.
  if (nowSeconds > envelope.issuedAt + OTP_TTL_SECONDS) {
    return { ok: false, reason: "expired" };
  }

  return matches ? { ok: true } : { ok: false, reason: "mismatch" };
}

/**
 * Recover the envelope a previous invocation left behind, or `null` on the first invocation of a
 * session (in which case the caller generates a fresh code).
 */
export function envelopeFromSession(session: readonly ChallengeResult[]): CodeEnvelope | null {
  const last = session[session.length - 1];
  if (!last || last.challengeName !== CUSTOM_CHALLENGE) return null;
  return decodeEnvelope(last.challengeMetadata);
}

/**
 * Mask an address for `publicChallengeParameters`.
 *
 * ⚠ This value IS returned to the client. It exists so the shopper can confirm which inbox to
 * check, and it must not confirm anything to anyone else — so the local part keeps at most its
 * first character.
 */
export function maskDestination(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = local.length > 0 ? local[0] : "";
  return `${head}${"•".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}
