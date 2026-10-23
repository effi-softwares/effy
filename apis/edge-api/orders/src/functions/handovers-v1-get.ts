import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, unavailable } from "@effy/edge-shared";
import { COURIER_VIEWS } from "@effy/shared-types";
import type { CourierView, HandoverListResponse } from "@effy/shared-types";

import { requireStaff } from "../lib/guard";
import { VALIDATION_FAILED } from "../lib/problems";
import { listCourierParcels } from "../orders/service";

/** The Courier tab's parcels for one `view`. Any active staff. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;

  const view = event.queryStringParameters?.view;
  if (view === undefined || !(COURIER_VIEWS as readonly string[]).includes(view)) {
    return problem(400, VALIDATION_FAILED, "Unknown view", `view must be one of ${COURIER_VIEWS.join(", ")}`, guard.scope);
  }
  try {
    return json(200, { items: await listCourierParcels(view as CourierView) } satisfies HandoverListResponse, guard.scope);
  } catch (err) {
    guard.scope.log.error({ err }, "orders: courier parcel list failed");
    return unavailable(guard.scope);
  }
};
