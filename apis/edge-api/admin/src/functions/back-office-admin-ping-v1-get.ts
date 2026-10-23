// Admin only, from the staff record (status and role), never the token.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { subject } from "@effy/edge-shared";
import { forbidden, json, preamble, problem, ProblemType, unavailable } from "@effy/edge-shared";
import { isActiveAdmin } from "../staff/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);

  const sub = subject(event);
  if (!sub) {
    return problem(401, ProblemType.Unauthenticated, "Authentication required",
      "a valid access token for this audience is required", scope);
  }

  let allowed: boolean;
  try {
    allowed = await isActiveAdmin(sub);
  } catch (err) {
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), sub },
      "admin ping: authorization check failed",
    );
    return unavailable(scope);
  }

  if (!allowed) {
    scope.log.warn({ sub }, "admin ping: not an active administrator (platform record)");
    return forbidden(scope);
  }

  return json(200, {
    audience: "back-office",
    scope: "admin",
    subject: sub,
    message: "pong",
  }, scope);
};
