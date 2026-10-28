import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery, unavailable } from "@effy/edge-shared";
import type { AdminOrderListResponse } from "@effy/shared-types";

import { requireStaff } from "../lib/guard";
import { ORDER_LIST_SPEC } from "../orders/list";
import { baseOf } from "../orders/repository";
import { listOrders, orderViewCounts } from "../orders/service";

/** The Orders list (103), or with `?views=only` its view counts under the same filters. Any active staff. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;

  try {
    const req = parseListQuery(event.queryStringParameters, ORDER_LIST_SPEC);
    if (req.viewsOnly) return json(200, { views: await orderViewCounts(baseOf(req)) }, guard.scope);
    return json(200, (await listOrders(req)) satisfies AdminOrderListResponse, guard.scope);
  } catch (err) {
    const refused = listProblem(err, guard.scope);
    if (refused) return refused;
    guard.scope.log.error({ err }, "orders: list failed");
    return unavailable(guard.scope);
  }
};
