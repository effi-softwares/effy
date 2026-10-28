import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery, preamble } from "@effy/edge-shared";

import { DRIVER_LIST_SPEC } from "../drivers/list";
import { driverViewCounts, listDrivers } from "../drivers/service";
import { denied, guard, mapFleetError } from "../shared/handler-support";

/** The driver register, a console list (103); `?views=only` answers every view's count instead of a page. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;

  try {
    const req = parseListQuery(event.queryStringParameters, DRIVER_LIST_SPEC);
    if (req.viewsOnly) return json(200, { views: await driverViewCounts(req) }, scope);
    return json(200, await listDrivers(req), scope);
  } catch (err) {
    return listProblem(err, scope) ?? mapFleetError(err, scope);
  }
};
