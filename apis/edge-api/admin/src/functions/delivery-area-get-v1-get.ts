// GET /admin/v1/delivery-zones/{id}/areas/{postcode} — everything one area gets, in ONE request
// (031 FR-022). Read access.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { getArea } from "../delivery/areas";
import { guard, mapDeliveryError } from "../delivery/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    const area = await getArea(
      event.pathParameters?.id ?? "",
      event.pathParameters?.postcode ?? "",
    );
    return json(200, area, scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
