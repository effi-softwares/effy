// PATCH /admin/v1/delivery/zones/{zoneId} — rename, set ring (override), same-day eligibility, or status (047).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError, toZoneDTO } from "../delivery/handler-support";
import { updateZone } from "../delivery/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  const zoneId = event.pathParameters?.zoneId ?? "";
  try {
    const body = JSON.parse(event.body ?? "{}");
    return json(200, toZoneDTO(await updateZone(zoneId, body, g.sub)), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
