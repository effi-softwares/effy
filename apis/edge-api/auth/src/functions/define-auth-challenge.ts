/**
 * Cognito `DefineAuthChallenge` — the state machine (035 FR-011).
 *
 * ⚠ THIS FUNCTION IS THE ONLY BRUTE-FORCE DEFENCE THE PLATFORM HAS.
 * Cognito imposes no quota on custom-challenge attempts and none on `RespondToAuthChallenge`
 * retries per session. Its per-user rate of 10 req/sec permits roughly 3,000 guesses inside one
 * 5-minute code lifetime against a 10^6 space. If the cap below is wrong, six digits is not safe.
 *
 * The decision itself lives in `policy.decideNextStep` so it can be tested exhaustively without
 * AWS; this handler is the thin edge (Principle VI).
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
      // ⚠ `decideNextStep` has already asserted that EVERY element of the session is
      // CUSTOM_CHALLENGE and that the last one succeeded. AWS: "always check `challengeName` …
      // and verify that it matches the expected value." Without that, tokens can be issued for a
      // challenge this platform never authored.
      event.response.issueTokens = true;
      event.response.failAuthentication = false;
      break;

    case "fail":
      event.response.issueTokens = false;
      event.response.failAuthentication = true;
      // ⚠ Emitted for BOTH real and phantom users. A metric that only fired for real accounts
      // would rebuild, in the dashboard, exactly the existence oracle the flow is hiding.
      emit("otp_attempts_exhausted", event.userPoolId);
      break;

    case "issue-challenge":
      event.response.issueTokens = false;
      event.response.failAuthentication = false;
      event.response.challengeName = CUSTOM_CHALLENGE;
      break;
  }

  // ⚠ Return the whole event. Cognito treats a missing request/response envelope as a trigger
  // failure, and a trigger failure fails the sign-in.
  return event;
};
