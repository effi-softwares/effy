// POST /admin/v1/delivery/zones/{zoneId}/suggest-ring — compute + persist the suggested distance ring from
// the zone's representative point vs the hub (047 FR-015). Advisory; the admin's chosen ring wins.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError } from "../delivery/handler-support";
import { suggestRing } from "../delivery/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  const zoneId = event.pathParameters?.zoneId ?? "";
  try {
    return json(200, await suggestRing(zoneId), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
