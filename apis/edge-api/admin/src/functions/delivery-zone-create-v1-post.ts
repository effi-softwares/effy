// POST /admin/v1/delivery-zones — create a serviced area (US4/FR-014). Mutate access (admin/manager).
// Audits delivery_zone.create in the same transaction.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { guard, mapDeliveryError, toZoneDTO } from "../delivery/handler-support";
import { createZone } from "../delivery/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  try {
    const zone = await createZone(parsed.value, g.sub);
    return json(201, toZoneDTO(zone), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
