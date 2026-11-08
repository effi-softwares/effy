import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, ConnectionLimitError, internal } from "@effy/edge-shared";

import { notificationSettingsActivitySource } from "../activity/notification-settings";
import { requireStaff } from "../lib/guard";

/** Every change to the promotion limits, in the activity drawer (104, 111). Any active staff, as the settings page. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  try {
    return await activityResponse(event.queryStringParameters, guard.scope, "bo-notification-settings", async () => notificationSettingsActivitySource());
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    guard.scope.log.error({ err }, "notification settings activity failed");
    return internal(guard.scope);
  }
};
