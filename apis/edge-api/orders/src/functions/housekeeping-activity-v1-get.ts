import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, ConnectionLimitError, internal } from "@effy/edge-shared";

import { housekeepingActivitySource } from "../housekeeping/activity";
import { requireStaff } from "../lib/guard";

/** The clean-ups' runs, late-payment refunds and abandon-time changes, in the activity drawer (104, 113). Any active staff. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  try {
    return await activityResponse(event.queryStringParameters, guard.scope, "bo-housekeeping", async () => housekeepingActivitySource());
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    guard.scope.log.error({ err }, "housekeeping activity failed");
    return internal(guard.scope);
  }
};
