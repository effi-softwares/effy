import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, offsetListPage, parseListQuery, preamble } from "@effy/edge-shared";

import { denied, guard, mapFleetError } from "../shared/handler-support";
import { VEHICLE_LIST_SPEC } from "../vehicles/list";
import { listVehicles, vehicleViewCounts } from "../vehicles/repository";

/** The vehicle register, a console list (103); `?views=only` answers every view's count instead of a page. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    const req = parseListQuery(event.queryStringParameters, VEHICLE_LIST_SPEC);
    if (req.viewsOnly) return json(200, { views: await vehicleViewCounts(req) }, scope);
    const r = await listVehicles(req);
    return json(200, offsetListPage(r.items, req, r), scope);
  } catch (err) {
    return listProblem(err, scope) ?? mapFleetError(err, scope);
  }
};
