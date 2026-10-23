import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, unavailable } from "@effy/edge-shared";
import { ORDER_AWAITING } from "@effy/shared-types";
import type { AdminOrderListResponse, OrderAwaiting } from "@effy/shared-types";

import { requireStaff } from "../lib/guard";
import { VALIDATION_FAILED } from "../lib/problems";
import { parseBaseFilters } from "../orders/filters";
import { DEFAULT_LIMIT, listOrders, MAX_LIMIT } from "../orders/service";

/** Any active staff. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;

  const qs = event.queryStringParameters ?? {};
  // Validated against the shared const, never a restated list.
  const awaiting =
    typeof qs.awaiting === "string" && (ORDER_AWAITING as readonly string[]).includes(qs.awaiting)
      ? (qs.awaiting as OrderAwaiting)
      : undefined;

  const base = parseBaseFilters(qs);
  if (!base.ok) return problem(400, VALIDATION_FAILED, base.title, base.detail, guard.scope);

  const parsed = Number(qs.limit);
  const limit = Number.isFinite(parsed)
    ? Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const result = await listOrders({
      ...base.filters,
      awaiting,
      needsDriver: qs.needsDriver === "true",
      cursor: qs.cursor || undefined,
      limit,
    });
    return json(200, result satisfies AdminOrderListResponse, guard.scope);
  } catch (err) {
    guard.scope.log.error({ err }, "orders: list failed");
    return unavailable(guard.scope);
  }
};
