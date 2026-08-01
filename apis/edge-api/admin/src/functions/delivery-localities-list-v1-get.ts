// GET /admin/v1/delivery-localities?q= — find places an operator could mean (031 US1). Read access.
//
// ⚠ Returns the SAME shape the shopper's search returns (`LocalityDTO`), reused unchanged from
// @effy/shared-types. One table, one contract, two audiences (Principle II).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError } from "../delivery/handler-support";
import { searchLocalities } from "../delivery/localities";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    const places = await searchLocalities(event.queryStringParameters?.q);
    return json(200, places, scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
