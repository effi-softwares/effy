// GET /admin/v1/delivery/plans?kind=effy|courier — every fee plan of a kind, with its gaps (077).
// Read: any active staff, csa included.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPricingError } from "../delivery/handler-support";
import { listPlans } from "../delivery/pricing.service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    return json(200, await listPlans(event.queryStringParameters?.kind), scope);
  } catch (err) {
    return mapPricingError(err, scope);
  }
};
