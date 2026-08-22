// GET /admin/v1/delivery/postcode-check?postcode= — the pre-add disclosure: the places a postcode makes
// serviceable, whether it is unknown, and whether another zone already holds it (047 FR-008/009/010). Read.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError } from "../delivery/handler-support";
import { checkPostcode } from "../delivery/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    return json(200, await checkPostcode(event.queryStringParameters?.postcode ?? ""), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
