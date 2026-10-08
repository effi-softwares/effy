// POST /admin/v1/delivery/plans/simulate — what would this delivery cost under this plan, and why
// (077 FR-025)? READ-ONLY: it writes nothing and announces nothing, so a csa may use it to explain a
// fee to a customer.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPricingError } from "../delivery/handler-support";
import { simulate } from "../delivery/pricing.service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    return json(200, await simulate(JSON.parse(event.body || "{}")), scope);
  } catch (err) {
    return mapPricingError(err, scope);
  }
};
