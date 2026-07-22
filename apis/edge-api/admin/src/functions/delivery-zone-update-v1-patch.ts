// PATCH /admin/v1/delivery-zones/{id} — rename and/or enable/disable a zone (US4/FR-014, FR-016).
// Mutate access. A disabled zone is not offered for new quotes; history is untouched. Audits
// delivery_zone.update.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { guard, mapDeliveryError, toZoneDTO } from "../delivery/handler-support";
import { updateZone } from "../delivery/service";

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
    return json(200, toZoneDTO(await updateZone(zoneId, parsed.value, g.sub)), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
