// GET /admin/v1/delivery/zones — list served zones with ring + same-day flag + postcode count (047). Read.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError, toZoneDTO } from "../delivery/handler-support";
import { listZones } from "../delivery/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    return json(200, { items: (await listZones()).map(toZoneDTO) }, scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
