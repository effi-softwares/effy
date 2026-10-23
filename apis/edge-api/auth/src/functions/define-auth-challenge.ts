/**
 * Cognito `DefineAuthChallenge`. The platform's only brute-force defence: Cognito caps neither
 * custom-challenge attempts nor retries per session. The decision lives in `policy.decideNextStep`.
 */

import { decideNextStep } from "../otp/policy.js";
import type { DefineAuthChallengeEvent } from "../otp/types.js";
import { CUSTOM_CHALLENGE } from "../otp/types.js";
import { emit } from "../lib/observability.js";

export const handler = async (
  event: DefineAuthChallengeEvent,
): Promise<DefineAuthChallengeEvent> => {
  const session = event.request.session ?? [];
  const userNotFound = event.request.userNotFound === true;

  const step = decideNextStep(session, userNotFound);

  switch (step.kind) {
    case "issue-tokens":
      // `decideNextStep` has checked every session element is CUSTOM_CHALLENGE and the last succeeded.
      event.response.issueTokens = true;
      event.response.failAuthentication = false;
      break;

    case "fail":
      event.response.issueTokens = false;
      event.response.failAuthentication = true;
      // Emitted for real and unknown users alike, or the metric would reveal existence.
      emit("otp_attempts_exhausted", event.userPoolId);
      break;

    case "issue-challenge":
      event.response.issueTokens = false;
      event.response.failAuthentication = false;
      event.response.challengeName = CUSTOM_CHALLENGE;
      break;
  }

  // Return the whole event: a missing envelope fails the sign-in.
  return event;
};
