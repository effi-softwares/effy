import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery, unavailable } from "@effy/edge-shared";
import type { CourierParcelListDTO } from "@effy/shared-types";

import { requireStaff } from "../lib/guard";
import { COURIER_LIST_SPEC } from "../orders/list";
import { courierParcelPage } from "../orders/service";

/** Courier parcels, a console list (103): one stage's page, with every stage's count. Any active staff. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  try {
    const req = parseListQuery(event.queryStringParameters, COURIER_LIST_SPEC);
    return json(200, (await courierParcelPage(req)) satisfies CourierParcelListDTO, guard.scope);
  } catch (err) {
    const refused = listProblem(err, guard.scope);
    if (refused) return refused;
    guard.scope.log.error({ err }, "orders: courier parcel list failed");
    return unavailable(guard.scope);
  }
};
