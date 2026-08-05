/**
 * Cognito `VerifyAuthChallengeResponse` — the comparison (035 FR-005, FR-008, FR-015, FR-016).
 *
 * ⚠ NO I/O IN THIS FUNCTION, ON ANY PATH. It is a pure comparison over values Cognito already
 * handed it. That is what makes the constant-time claim auditable — a network call anywhere in
 * here would dominate the timing and make the careful compare in `policy.verifyAnswer` pointless.
 *
 * ⚠ AND IT NEVER THROWS. Cognito returns trigger errors to the client as
 * `{{[trigger]}} failed with error {{[error text]}}`. A thrown message on a user-data condition —
 * "no email attribute for user", say — reaches the caller verbatim and is an existence oracle.
 */

import { emit } from "../lib/observability.js";
import { hmacKey } from "../lib/secret.js";
import { verifyAnswer, normalizeAnswer } from "../otp/policy.js";
import type { VerifyAuthChallengeEvent } from "../otp/types.js";

export const handler = async (
  event: VerifyAuthChallengeEvent,
): Promise<VerifyAuthChallengeEvent> => {
  const params = event.request.privateChallengeParameters ?? {};
  const digest = params["digest"] ?? "";
  const issuedAtRaw = params["issuedAt"] ?? "0";
  const issuedAt = Number.parseInt(issuedAtRaw, 10);

  let key: string;
  try {
    key = await hmacKey();
  } catch {
    // Infrastructure failure → fail closed (FR-017). Nobody is signed in without a verified code.
    emit("otp_verify_failed", event.userPoolId);
    event.response.answerCorrect = false;
    return event;
  }

  const envelope =
    digest.length > 0 && Number.isSafeInteger(issuedAt) && issuedAt > 0
      ? { digest, issuedAt }
      : null;

  const verdict = verifyAnswer({
    answer: normalizeAnswer(event.request.challengeAnswer ?? ""),
    envelope,
    key,
    nowSeconds: Math.floor(Date.now() / 1000),
  });

  // ⚠ THE PHANTOM PATH RAN THE SAME COMPARE. `verifyAnswer` was called unconditionally above —
  // including when `userNotFound` is set, where `create-auth-challenge` left an empty envelope —
  // so the work done before this line does not distinguish a real account from an unknown one.
  // Only the final answer is forced.
  const correct = verdict.ok && event.request.userNotFound !== true;

  if (!correct) emit("otp_verify_failed", event.userPoolId);

  event.response.answerCorrect = correct;
  return event;
};
