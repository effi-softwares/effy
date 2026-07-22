// POST /admin/v1/delivery-zones/{id}/postcodes — assign postcode(s) to the zone (US4/FR-014). Mutate
// access. A postcode already in a zone → 409 (UNIQUE postcode, 23505). Audits
// delivery_zone.postcode_add.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { guard, mapDeliveryError, toPostcodeDTO } from "../delivery/handler-support";
import { addZonePostcodes } from "../delivery/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  const zoneId = event.pathParameters?.id ?? "";
  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  try {
    const added = await addZonePostcodes(zoneId, parsed.value, g.sub);
    return json(201, added.map(toPostcodeDTO), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
