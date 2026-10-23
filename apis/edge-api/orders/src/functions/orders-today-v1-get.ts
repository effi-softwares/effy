import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, unavailable } from "@effy/edge-shared";
import type { AdminOrdersTodayDTO } from "@effy/shared-types";

import { requireStaff } from "../lib/guard";
import { ordersToday } from "../orders/service";

/** Placed since midnight Melbourne, by delivery type, and refunded today. Any active staff. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  try {
    return json(200, (await ordersToday()) satisfies AdminOrdersTodayDTO, guard.scope);
  } catch (err) {
    guard.scope.log.error({ err }, "orders: today summary failed");
    return unavailable(guard.scope);
  }
};
