// DELETE /admin/v1/delivery/zones/{zoneId}/postcodes/{postcode} — remove a postcode; the response states
// which places stop being serviceable (047 FR-011).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError } from "../delivery/handler-support";
import { removePostcode } from "../delivery/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  const zoneId = event.pathParameters?.zoneId ?? "";
  const postcode = event.pathParameters?.postcode ?? "";
  try {
    return json(200, await removePostcode(zoneId, postcode, g.sub), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
