// POST /admin/v1/delivery/zones — create a served zone (047). Mutate: admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError, toZoneDTO } from "../delivery/handler-support";
import { createZone } from "../delivery/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    const body = JSON.parse(event.body ?? "{}");
    return json(201, toZoneDTO(await createZone(body, g.sub)), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
