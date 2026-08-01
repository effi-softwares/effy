// POST /admin/v1/delivery-zones/{id}/areas/{postcode}/not-served — record a deliberate decision NOT
// to serve an area (031 FR-011). Mutate access (admin/manager).
//
// ⚠ THIS DOES TWO THINGS IN ONE TRANSACTION: it records the decision AND withdraws the postcode from
// the zone. Recording alone would change nothing — serviceability is decided by zone membership, so a
// decision written beside it would leave the storefront still answering "we deliver here" for an area
// an admin explicitly marked unserved.
//
// ⚠ The decision SURVIVES the withdrawal (there is no FK, by design), so the console can still say
// who decided it, when and why, and re-adding the area surfaces that history.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { markAreaNotServed } from "../delivery/areas";
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
    await markAreaNotServed(
      event.pathParameters?.id ?? "",
      event.pathParameters?.postcode ?? "",
      parsed.value,
      g.sub,
    );
    return json(204, undefined, scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
