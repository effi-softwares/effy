import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, problem } from "@effy/edge-shared";

import { pointsActivitySource } from "../activity/points";
import { pointsProblem } from "../customers/respond";
import { requireStaff } from "../lib/guard";
import { NOT_FOUND } from "../lib/problems";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A customer's points activity in the activity drawer (104). Any active staff. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  const customerId = event.pathParameters?.customerId ?? "";
  if (!UUID.test(customerId)) return problem(404, NOT_FOUND, "Not found", "no such customer", guard.scope);
  try {
    return await activityResponse(event.queryStringParameters, guard.scope, "bo-points", async () => pointsActivitySource(customerId));
  } catch (err) {
    return pointsProblem(guard.scope, err, "points history");
  }
};
