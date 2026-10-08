// POST /admin/v1/delivery/plans — create a DRAFT fee plan (077). Mutate: admin/manager.
// Value errors are a 422 naming each field; missing bands are not refused — they come back as gaps.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPricingError } from "../delivery/handler-support";
import { createPlan } from "../delivery/pricing.service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    return json(201, await createPlan(JSON.parse(event.body || "{}"), g.sub), scope);
  } catch (err) {
    return mapPricingError(err, scope);
  }
};
