import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, unavailable } from "@effy/edge-shared";
import { COURIER_VIEWS } from "@effy/shared-types";
import type { CourierView, HandoverDueFilter, HandoverListResponse } from "@effy/shared-types";

import { requireStaff } from "../lib/guard";
import { VALIDATION_FAILED } from "../lib/problems";
import { listCourierParcels, listHandovers } from "../orders/service";

const DUE: readonly HandoverDueFilter[] = ["today", "overdue", "upcoming"];

/**
 * GET /orders/v1/handovers?due=today|overdue|upcoming — standard packages to hand to the carrier
 * (069 US7).
 *
 * Read gate is ANY active staff including `csa`, like the order list: knowing what must leave the
 * hub today is triage. Recording the handover itself stays admin|manager (053 FR-015).
 *
 * ⚠ `due` IS REQUIRED AND VALIDATED, never defaulted. A list that silently fell back to "today" on a
 * mistyped filter would show a clean screen to someone who asked what was overdue.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;

  // 080 — the Courier tab asks by `view`; 069's `due` keeps working for consoles built before it.
  const view = event.queryStringParameters?.view;
  if (view !== undefined) {
    if (!(COURIER_VIEWS as readonly string[]).includes(view)) {
      return problem(400, VALIDATION_FAILED, "Unknown view", `view must be one of ${COURIER_VIEWS.join(", ")}`, guard.scope);
    }
    try {
      return json(200, { items: await listCourierParcels(view as CourierView) } satisfies HandoverListResponse, guard.scope);
    } catch (err) {
      guard.scope.log.error({ err }, "orders: courier parcel list failed");
      return unavailable(guard.scope);
    }
  }

  const due = event.queryStringParameters?.due;
  if (typeof due !== "string" || !(DUE as readonly string[]).includes(due)) {
    return problem(
      400,
      VALIDATION_FAILED,
      "Unknown filter",
      "due must be one of today, overdue or upcoming",
      guard.scope,
    );
  }

  try {
    const items = await listHandovers(due as HandoverDueFilter);
    return json(200, { items } satisfies HandoverListResponse, guard.scope);
  } catch (err) {
    guard.scope.log.error({ err }, "orders: handover list failed");
    return unavailable(guard.scope);
  }
};
