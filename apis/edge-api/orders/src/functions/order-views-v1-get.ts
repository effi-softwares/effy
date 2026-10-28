import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery, unavailable } from "@effy/edge-shared";
import type { AdminOrderViewCountsDTO } from "@effy/shared-types";

import { requireStaff } from "../lib/guard";
import { ORDER_LIST_SPEC } from "../orders/list";
import { baseOf } from "../orders/repository";
import { orderViewCounts } from "../orders/service";

/** Each saved view's count under the list's search and filters (the same parsing as the list). Any active staff. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  try {
    const req = parseListQuery(event.queryStringParameters, ORDER_LIST_SPEC);
    return json(200, (await orderViewCounts(baseOf(req))) satisfies AdminOrderViewCountsDTO, guard.scope);
  } catch (err) {
    const refused = listProblem(err, guard.scope);
    if (refused) return refused;
    guard.scope.log.error({ err }, "orders: view counts failed");
    return unavailable(guard.scope);
  }
};
