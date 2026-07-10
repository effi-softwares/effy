import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { forbidden, json, preamble, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";

import { isActiveStoreManager } from "../staff/service";

/**
 * GET /store/v1/manager-ping — the manager-only proving read.
 *
 * Authorization is decided from the PLATFORM RECORD (role AND status AND store scope), never from
 * the cognito:groups claim. A token carrying `store_manager` is refused if the record says
 * disabled, unassigned, inactive-store, or role-less. That is the whole point (FR-021).
 *
 * The 403 body is uniform and does NOT disclose which term failed — that would leak the platform's
 * record state to a caller who was just told they may not read it.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);

  const sub = subject(event);
  if (!sub) {
    return problem(
      401,
      ProblemType.Unauthenticated,
      "Authentication required",
      "a valid access token for this audience is required",
      scope,
    );
  }

  let allowed: boolean;
  try {
    allowed = await isActiveStoreManager(sub);
  } catch (err) {
    // FAIL CLOSED. A failed authorization check is never a grant.
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), sub },
      "manager ping: authorization check failed",
    );
    return unavailable(scope);
  }

  if (!allowed) {
    scope.log.warn({ sub }, "manager ping: not an active store manager at an active store");
    return forbidden(scope);
  }

  return json(
    200,
    { audience: "store", scope: "store_manager", subject: sub, message: "pong" },
    scope,
  );
};
