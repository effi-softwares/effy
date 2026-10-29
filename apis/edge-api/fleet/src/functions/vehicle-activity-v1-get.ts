// Any active staff, as the vehicle page.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, preamble } from "@effy/edge-shared";

import { vehicleActivitySource } from "../activity/sources";
import { denied, guard, mapFleetError } from "../shared/handler-support";

/** The vehicle's activity — changes, who held it, cleared checks — in the activity drawer (104). */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return await activityResponse(event.queryStringParameters, scope, "bo-vehicle", async () =>
      vehicleActivitySource(event.pathParameters?.vehicleId ?? ""),
    );
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
