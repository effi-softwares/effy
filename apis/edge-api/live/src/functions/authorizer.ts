import { logger } from "@effy/edge-shared";
import { driverScope, opsScope, shopScope } from "@effy/edge-shared/live";

import { authorize, type Decision } from "../authorize/service";
import { verifyToken } from "../authorize/verify";

/** `channel` is absent on connect. */
interface LiveAuthorizerEvent {
  authorizationToken?: string;
  requestContext?: {
    operation?: string;
    channel?: string | null;
  };
}

interface LiveAuthorizerResult {
  isAuthorized: boolean;
  ttlOverride: number;
}

/** Answers are cached per channel, and each epoch is a new channel, so ended access still ends on time. */
const ANSWER_TTL_SECONDS = 300;

export async function handler(event: LiveAuthorizerEvent): Promise<LiveAuthorizerResult> {
  const operation = event.requestContext?.operation ?? "";
  let decision: Decision;
  try {
    decision = await authorize(
      {
        operation,
        token: event.authorizationToken ?? "",
        channel: event.requestContext?.channel ?? null,
      },
      { verify: verifyToken, shopScope, driverScope, opsScope, now: Date.now },
    );
  } catch (err) {
    // Refuse, but uncached: a five-minute memory of a one-second fault would keep a shop dark.
    logger.error({ err, operation }, "live: authorizer failed, refusing");
    return { isAuthorized: false, ttlOverride: 0 };
  }

  // Never the token or the channel: its middle segment says whose updates were asked for.
  logger.info({ operation, audience: decision.audience, outcome: decision.outcome }, "live: authorized");
  return { isAuthorized: decision.isAuthorized, ttlOverride: ANSWER_TTL_SECONDS };
}
