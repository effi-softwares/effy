/**
 * Cognito `VerifyAuthChallengeResponse`. No I/O on any path, so the constant-time compare holds; and
 * never throws, because Cognito relays error text to the client.
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
    // Fail closed.
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

  // The compare ran for unknown users too; only the final answer is forced.
  const correct = verdict.ok && event.request.userNotFound !== true;

  if (!correct) emit("otp_verify_failed", event.userPoolId);

  event.response.answerCorrect = correct;
  return event;
};
