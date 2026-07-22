// DELETE /admin/v1/delivery-zones/{id}/postcodes/{postcode} — unassign a postcode (US4/FR-014).
// Mutate access. Audits delivery_zone.postcode_remove.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError } from "../delivery/handler-support";
import { removeZonePostcode } from "../delivery/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  const zoneId = event.pathParameters?.id ?? "";
  const postcode = event.pathParameters?.postcode ?? "";
  try {
    await removeZonePostcode(zoneId, postcode, g.sub);
    return { statusCode: 204, headers: { "x-request-id": scope.requestId }, body: "" };
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
