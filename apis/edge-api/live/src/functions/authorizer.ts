import { logger } from "@effy/edge-shared";
import { driverScope, opsScope, shopScope } from "@effy/edge-shared/live";

import { authorize, type Decision } from "../authorize/service";
import { verifyToken } from "../authorize/verify";

/** What the channel sends its authorizer. `channel` is absent on connect. */
interface LiveAuthorizerEvent {
  authorizationToken?: string;
  requestContext?: {
    operation?: string;
    channel?: string | null;
  };
}

interface LiveAuthorizerResult {
  isAuthorized: boolean;
  /** Seconds the channel may reuse this answer for the same token, operation and channel. */
  ttlOverride: number;
}

/**
 * How long an answer is reused. Five minutes keeps an open app to a run or two per epoch. It does
 * not weaken the fifteen-minute bound on ended access (FR-023): the answer is cached per CHANNEL,
 * every epoch is a new channel, and so a new epoch is always decided afresh.
 */
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
    // The database is stopped, a secret could not be read. Refuse — but do not let the channel
    // remember it: a five-minute memory of a one-second fault would keep a whole shop dark.
    logger.error({ err, operation }, "live: authorizer failed, refusing");
    return { isAuthorized: false, ttlOverride: 0 };
  }

  // Operation, audience and outcome. Never the token, never the channel — its middle segment is
  // whose updates were asked for.
  logger.info({ operation, audience: decision.audience, outcome: decision.outcome }, "live: authorized");
  return { isAuthorized: decision.isAuthorized, ttlOverride: ANSWER_TTL_SECONDS };
}
