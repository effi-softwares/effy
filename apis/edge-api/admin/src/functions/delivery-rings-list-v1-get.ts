// GET /admin/v1/delivery/rings — list distance rings (047). Read: any active staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError, toRingDTO } from "../delivery/handler-support";
import { listRings } from "../delivery/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    const rings = await listRings();
    return json(200, { items: rings.map(toRingDTO) }, scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
