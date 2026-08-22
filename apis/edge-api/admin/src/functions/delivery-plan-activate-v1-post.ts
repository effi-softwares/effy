// POST /admin/v1/delivery/plans/{planId}/activate — make a plan the single active one (047 FR-049).
// ⚠ Refused (422) with the gap named if the plan cannot price every served zone (FR-051/SC-016).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError, toFeePlanDTO } from "../delivery/handler-support";
import { activatePlan } from "../delivery/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  const planId = event.pathParameters?.planId ?? "";
  try {
    const plan = await activatePlan(planId, g.sub);
    return json(200, toFeePlanDTO(plan), scope);
  } catch (err) {
    // A completeness refusal is a 422 problem+json whose detail names the gap (mapDeliveryError); the
    // service message already lists the unpriced rings / missing weight band (FR-051/SC-016).
    return mapDeliveryError(err, scope);
  }
};
