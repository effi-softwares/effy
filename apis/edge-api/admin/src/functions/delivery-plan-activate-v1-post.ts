// POST /admin/v1/delivery/plans/{planId}/activate — make a plan the one in force for its kind (077).
// ⚠ 409 plan_incomplete carries every blocking gap; a $0 minimum needs { confirmZeroFloor: true }.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPricingError } from "../delivery/handler-support";
import { activatePlan } from "../delivery/pricing.service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    return json(200, await activatePlan(event.pathParameters?.planId, JSON.parse(event.body || "{}"), g.sub), scope);
  } catch (err) {
    return mapPricingError(err, scope);
  }
};
