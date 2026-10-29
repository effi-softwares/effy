// Any active staff: a csa asked "who suspended this driver" should be able to answer.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, preamble } from "@effy/edge-shared";

import { driverActivitySource } from "../activity/sources";
import { denied, guard, mapFleetError } from "../shared/handler-support";

/** The driver's activity, in the activity drawer (104). */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return await activityResponse(event.queryStringParameters, scope, "bo-driver", async () =>
      driverActivitySource(event.pathParameters?.driverId ?? ""),
    );
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
