import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse } from "@effy/edge-shared";

import { pointsSettingsActivitySource } from "../activity/points";
import { pointsProblem } from "../customers/respond";
import { requireStaff } from "../lib/guard";

/** Every change to the points rules, in the activity drawer (104). Any active staff, as the settings page. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  try {
    return await activityResponse(event.queryStringParameters, guard.scope, "bo-points-settings", async () => pointsSettingsActivitySource());
  } catch (err) {
    return pointsProblem(guard.scope, err, "points settings activity");
  }
};
