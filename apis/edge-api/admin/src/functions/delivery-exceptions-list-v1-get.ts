// GET /admin/v1/delivery/zones/{zoneId}/sameday-exceptions — per-shop same-day overrides (047 US3). Read.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import { guard, mapDeliveryError } from "../delivery/handler-support";
import { listExceptions } from "../delivery/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  const zoneId = event.pathParameters?.zoneId ?? "";
  try {
    return json(200, { items: await listExceptions(zoneId) }, scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
