import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, unavailable } from "@effy/edge-shared";
import type { AdminOrderViewCountsDTO } from "@effy/shared-types";

import { requireStaff } from "../lib/guard";
import { VALIDATION_FAILED } from "../lib/problems";
import { parseBaseFilters } from "../orders/filters";
import { orderViewCounts } from "../orders/service";

/** Each saved view's count under the list's search and filters. Any active staff. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  const base = parseBaseFilters(event.queryStringParameters ?? {});
  if (!base.ok) return problem(400, VALIDATION_FAILED, base.title, base.detail, guard.scope);
  try {
    return json(200, (await orderViewCounts(base.filters)) satisfies AdminOrderViewCountsDTO, guard.scope);
  } catch (err) {
    guard.scope.log.error({ err }, "orders: view counts failed");
    return unavailable(guard.scope);
  }
};
