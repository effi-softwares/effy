/**
 * Cognito `CreateAuthChallenge` — issue the code (035 FR-001, FR-010, FR-012, FR-016).
 *
 * ⚠ THE TIGHTEST BUDGET IN THE SLICE. Cognito abandons the call at 5 seconds and cannot be
 * configured otherwise. This function does one DynamoDB update and one SES send, possibly on a
 * ~1s cold start. Everything here is arranged to keep that inside the wall.
 *
 * ⚠ IT ALSO RUNS ON EVERY RETRY. When someone mistypes, `DefineAuthChallenge` re-issues
 * CUSTOM_CHALLENGE and Cognito calls this function AGAIN — with an empty response object.
 * Generating a new code there would mail a shopper a fresh code for their own typo, put several
 * live-looking codes in their inbox, and burn their hourly budget on user error. So the first
 * invocation generates; every later one REUSES the envelope carried in `challengeMetadata`.
 */

import { audienceForPool } from "../lib/audience.js";
import { emit } from "../lib/observability.js";
import { hmacKey } from "../lib/secret.js";
import { encodeEnvelope, digestCode } from "../otp/codec.js";
import { reserve } from "../otp/issuance.js";
import { sendCode } from "../otp/mailer.js";
import { envelopeFromSession, generateCode, maskDestination } from "../otp/policy.js";
import type { CreateAuthChallengeEvent } from "../otp/types.js";
import { CUSTOM_CHALLENGE } from "../otp/types.js";

/**
 * A stable identity for THIS authentication session, used to make the send counter idempotent
 * across Cognito's own retries. Derived from data every invocation of a given session shares.
 */
function sendMarker(event: CreateAuthChallengeEvent, issuedAt: number): string {
  return `${event.userName}:${issuedAt}`;
}

export const handler = async (
  event: CreateAuthChallengeEvent,
): Promise<CreateAuthChallengeEvent> => {
  if (event.request.challengeName !== CUSTOM_CHALLENGE) return event;

  const session = event.request.session ?? [];
  const userNotFound = event.request.userNotFound === true;
  const email = event.request.userAttributes?.["email"] ?? event.userName;

  // ⚠ Set on EVERY path, before anything can go wrong, and identical for a phantom user. This is
  // the only thing the client sees; it must never distinguish a real account from an unknown one.
  event.response.publicChallengeParameters = { maskedDestination: maskDestination(email) };

  const profile = audienceForPool(event.userPoolId);
  if (!profile) {
    // ⚠ Fail closed on a pool this code was never reviewed against — but WITHOUT throwing.
    // Cognito relays trigger error text to the client verbatim. An empty envelope means the verify
    // step can never match, so the sign-in refuses on its own.
    emit("otp_unknown_pool", event.userPoolId);
    event.response.privateChallengeParameters = { digest: "", issuedAt: "0" };
    event.response.challengeMetadata = "";
    return event;
  }

  // ── Retry path: reuse, never regenerate ────────────────────────────────────────────────────
  const existing = envelopeFromSession(session);
  if (existing) {
    event.response.privateChallengeParameters = {
      digest: existing.digest,
      issuedAt: String(existing.issuedAt),
    };
    event.response.challengeMetadata = encodeEnvelope(existing);
    return event; // ⚠ No email. No counter increment. Deliberate.
  }

  // ── First invocation: generate, throttle, send ─────────────────────────────────────────────
  const issuedAt = Math.floor(Date.now() / 1000);
  const code = generateCode();

  let key: string;
  try {
    key = await hmacKey();
  } catch {
    // Infrastructure failure. Refuse opaquely rather than throwing a message the caller would read.
    emit("otp_send_failed", event.userPoolId);
    event.response.privateChallengeParameters = { digest: "", issuedAt: "0" };
    event.response.challengeMetadata = "";
    return event;
  }

  // ⚠ Reserved for phantom users too — otherwise the row's absence is a second existence oracle,
  // and unknown addresses get unlimited free probing (FR-016).
  const verdict = await reserve({
    userPoolId: event.userPoolId,
    email,
    hmacKey: key,
    nowSeconds: issuedAt,
    sendMarker: sendMarker(event, issuedAt),
  });

  if ("degraded" in verdict) emit("otp_ratelimit_store_unavailable", event.userPoolId);

  if (!verdict.allowed) {
    emit("otp_rate_limited", event.userPoolId);
    // ⚠ Same shape as a successful issue, minus a usable secret. The shopper is told to wait by
    // the client's refusal copy; the trigger says nothing that distinguishes this from any other
    // failure to sign in.
    event.response.privateChallengeParameters = { digest: "", issuedAt: "0" };
    event.response.challengeMetadata = "";
    return event;
  }

  try {
    // ⚠ The phantom path STILL CALLS SES (to the mailbox simulator). Skipping the call entirely
    // would make an unknown address answer measurably faster than a real one, and existence would
    // leak through latency despite every response body being identical.
    await sendCode({ to: email, code, profile, phantom: userNotFound });
  } catch {
    emit("otp_send_failed", event.userPoolId);
    event.response.privateChallengeParameters = { digest: "", issuedAt: "0" };
    event.response.challengeMetadata = "";
    return event;
  }

  const envelope = { issuedAt, digest: digestCode(code, key) };
  // ⚠ The digest, never the code. `privateChallengeParameters` is server-side, but
  // `challengeMetadata` round-trips through the client's Session string — see `codec.ts`.
  event.response.privateChallengeParameters = {
    digest: envelope.digest,
    issuedAt: String(envelope.issuedAt),
  };
  event.response.challengeMetadata = encodeEnvelope(envelope);

  emit("otp_code_issued", event.userPoolId);
  return event;
};
