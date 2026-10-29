import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, problem, unavailable } from "@effy/edge-shared";

import { orderActivitySource } from "../activity/order";
import { requireStaff } from "../lib/guard";
import { NOT_FOUND } from "../lib/problems";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An order's activity — every record about it in one log, in the activity drawer (104). Any active staff. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  const orderId = event.pathParameters?.orderId ?? "";
  if (!UUID.test(orderId)) return problem(404, NOT_FOUND, "No such order", "that order does not exist", guard.scope);
  try {
    return await activityResponse(event.queryStringParameters, guard.scope, "bo-order", async () => orderActivitySource(orderId));
  } catch (err) {
    guard.scope.log.error({ err, orderId }, "orders: activity failed");
    return unavailable(guard.scope);
  }
};
