// PUT /admin/v1/delivery-zones/{id}/areas/{postcode} — configure an area's service levels (031 US2).
// Mutate access (admin/manager).
//
// ⚠ A REPLACE, not a patch: a method omitted is a method turned OFF. Ambiguity about what is offered
// is exactly what this feature exists to remove.
//
// ⚠ Enabling same_day where no shop shares the area's zone is REFUSED (422) unless the request
// carries `noNearbyShopAcknowledged`. A fee is a business choice the platform can absorb; same-day is
// a physical claim about time. The guard is server-side because a UI-only guard is not a guard.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { configureArea } from "../delivery/areas";
import { guard, mapDeliveryError } from "../delivery/handler-support";

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
    const area = await configureArea(
      event.pathParameters?.id ?? "",
      event.pathParameters?.postcode ?? "",
      parsed.value,
      g.sub,
    );
    return json(200, area, scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
