// POST /admin/v1/delivery/zones/{zoneId}/postcodes {postcode, confirm?} — add a postcode by place (047).
// Refuses a postcode already in another zone (409); an unknown postcode needs confirm:true (422).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError } from "../delivery/handler-support";
import { addPostcode } from "../delivery/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  const zoneId = event.pathParameters?.zoneId ?? "";
  try {
    const body = JSON.parse(event.body ?? "{}");
    return json(201, await addPostcode(zoneId, body.postcode ?? "", body.confirm === true, g.sub), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
