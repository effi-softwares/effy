/**
 * Cognito `CreateAuthChallenge`: issues the code. Cognito abandons the call at 5 s. It also runs on
 * every retry after a mistyped code; only the first invocation generates and sends, later ones reuse
 * the envelope in `challengeMetadata`, so a typo never mails a new code or spends the budget.
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

/** Stable per authentication session, so the send counter is idempotent across Cognito retries. */
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

  // Set first on every path and identical for an unknown user: it must not reveal whether an account exists.
  event.response.publicChallengeParameters = { maskedDestination: maskDestination(email) };

  const profile = audienceForPool(event.userPoolId);
  if (!profile) {
    // Unknown pool: fail closed without throwing (Cognito relays error text). An empty envelope never matches.
    emit("otp_unknown_pool", event.userPoolId);
    event.response.privateChallengeParameters = { digest: "", issuedAt: "0" };
    event.response.challengeMetadata = "";
    return event;
  }

  const existing = envelopeFromSession(session);
  if (existing) {
    event.response.privateChallengeParameters = {
      digest: existing.digest,
      issuedAt: String(existing.issuedAt),
    };
    event.response.challengeMetadata = encodeEnvelope(existing);
    return event;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const code = generateCode();

  let key: string;
  try {
    key = await hmacKey();
  } catch (err) {
    // Refuse opaquely. Log the error name only (see logFailure).
    logFailure("hmac-key", err);
    emit("otp_send_failed", event.userPoolId);
    event.response.privateChallengeParameters = { digest: "", issuedAt: "0" };
    event.response.challengeMetadata = "";
    return event;
  }

  // Reserved for unknown users too, or the row's absence would reveal existence.
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
    // Same shape as a successful issue, minus a usable secret.
    event.response.privateChallengeParameters = { digest: "", issuedAt: "0" };
    event.response.challengeMetadata = "";
    return event;
  }

  try {
    // Unknown users still call SES (the mailbox simulator), so latency reveals nothing.
    await sendCode({ to: email, code, profile, phantom: userNotFound });
  } catch (err) {
    logFailure("ses-send", err);
    emit("otp_send_failed", event.userPoolId);
    event.response.privateChallengeParameters = { digest: "", issuedAt: "0" };
    event.response.challengeMetadata = "";
    return event;
  }

  const envelope = { issuedAt, digest: digestCode(code, key) };
  // The digest, never the code: `challengeMetadata` round-trips through the client (see `codec.ts`).
  event.response.privateChallengeParameters = {
    digest: envelope.digest,
    issuedAt: String(envelope.issuedAt),
  };
  event.response.challengeMetadata = encodeEnvelope(envelope);

  emit("otp_code_issued", event.userPoolId);
  return event;
};

/**
 * Logs the error name only: SES rejection messages embed the recipient's address.
 * Common: MessageRejected (sandbox, unverified recipient), AccountSendingPausedException,
 * AccessDeniedException (role lacks ses:SendEmail).
 */
function logFailure(stage: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  // eslint-disable-next-line no-console -- structured line; the metric carries the alarm.
  console.log(JSON.stringify({ level: "error", msg: "otp send failed", stage, error: name }));
}
