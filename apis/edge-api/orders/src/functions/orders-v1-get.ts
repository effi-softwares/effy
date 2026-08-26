import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, unavailable } from "@effy/edge-shared";
import type { AdminOrderListResponse, OrderAwaiting } from "@effy/shared-types";

import { requireStaff } from "../lib/guard";
import { DEFAULT_LIMIT, listOrders, MAX_LIMIT } from "../orders/service";

/**
 * GET /orders/v1/orders — the back-office order list (053 US1).
 *
 * Read gate is ANY active staff including `csa` (FR-015): triage is a CSA's work, and until this
 * feature they could not see a single order they were being asked about.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;

  const qs = event.queryStringParameters ?? {};
  const awaiting =
    qs.awaiting === "handover" || qs.awaiting === "arrival"
      ? (qs.awaiting as OrderAwaiting)
      : undefined;

  const parsed = Number(qs.limit);
  const limit = Number.isFinite(parsed)
    ? Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const result = await listOrders({
      q: qs.q?.trim() || undefined,
      status: qs.status || undefined,
      awaiting,
      cursor: qs.cursor || undefined,
      limit,
    });
    return json(200, result satisfies AdminOrderListResponse, guard.scope);
  } catch (err) {
    guard.scope.log.error({ err }, "orders: list failed");
    return unavailable(guard.scope);
  }
};
