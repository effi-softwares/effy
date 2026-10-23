// Records the staff member on first contact (upsert + role reconcile) and returns the record; admits
// any authenticated caller. The access token carries `username`, not `email`, so that is stored.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { claim, groups, subject } from "@effy/edge-shared";
import { json, preamble, problem, ProblemType, unavailable } from "@effy/edge-shared";
import { recordAndLoad } from "../staff/service";

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

  const email = claim(event, "username") ?? sub;

  try {
    const record = await recordAndLoad(sub, email, groups(event));
    return json(200, {
      subject: record.subject,
      email: record.email,
      roles: record.roles,
      status: record.status,
      lastSeenAt: record.lastSeenAt,
    }, scope);
  } catch (err) {
    scope.log.error({ err, sub }, "me: staff record upsert failed");
    return unavailable(scope);
  }
};
