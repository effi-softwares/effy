// GET /admin/v1/delivery/settings — the operating hub + same-day prep buffer (047). Read.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError } from "../delivery/handler-support";
import { getSettings } from "../delivery/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    return json(200, (await getSettings()) ?? { hubLatitude: null, hubLongitude: null, samedayPrepBufferMin: null }, scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
