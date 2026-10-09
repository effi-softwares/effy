import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, unavailable } from "@effy/edge-shared";
import { ADMIN_ORDER_DELIVERY_FILTERS, ORDER_AWAITING } from "@effy/shared-types";
import type { AdminOrderDeliveryFilter, AdminOrderListResponse, OrderAwaiting } from "@effy/shared-types";

import { requireStaff } from "../lib/guard";
import { VALIDATION_FAILED } from "../lib/problems";
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
  // ⚠ VALIDATED AGAINST THE SHARED CONST, never a list restated here. A hand-written copy is how a
  // new value gets added to the type and silently REJECTED by the route — the same trap the shop
  // service's `REQUESTABLE` was carrying (055 T073).
  const awaiting =
    typeof qs.awaiting === "string" && (ORDER_AWAITING as readonly string[]).includes(qs.awaiting)
      ? (qs.awaiting as OrderAwaiting)
      : undefined;

  // 079 — who delivers the order. Validated against the shared const, like `awaiting` above; an
  // unknown value is refused rather than quietly listing everything.
  if (qs.deliveryType !== undefined && !(ADMIN_ORDER_DELIVERY_FILTERS as readonly string[]).includes(qs.deliveryType)) {
    return problem(400, VALIDATION_FAILED, "Bad delivery type", "deliveryType is effy, courier or legacy", guard.scope);
  }
  const deliveryType = qs.deliveryType as AdminOrderDeliveryFilter | undefined;
  // 083 — "still open" narrows the old-kind orders only; anywhere else it would quietly mean nothing.
  if (qs.open !== undefined && (qs.open !== "true" || deliveryType !== "legacy")) {
    return problem(400, VALIDATION_FAILED, "Bad filter", "open=true is used with deliveryType=legacy", guard.scope);
  }

  const parsed = Number(qs.limit);
  const limit = Number.isFinite(parsed)
    ? Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const result = await listOrders({
      q: qs.q?.trim() || undefined,
      status: qs.status || undefined,
      awaiting,
      // 073 — "Needs a driver".
      needsDriver: qs.needsDriver === "true",
      deliveryType,
      stillOpen: qs.open === "true",
      cursor: qs.cursor || undefined,
      limit,
    });
    return json(200, result satisfies AdminOrderListResponse, guard.scope);
  } catch (err) {
    guard.scope.log.error({ err }, "orders: list failed");
    return unavailable(guard.scope);
  }
};
