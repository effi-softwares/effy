// Plan_not_draft once the plan was ever active: it is a record of what was charged.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPricingError } from "../delivery/handler-support";
import { replaceDraft } from "../delivery/pricing.service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    return json(200, await replaceDraft(event.pathParameters?.planId, JSON.parse(event.body || "{}"), g.sub), scope);
  } catch (err) {
    return mapPricingError(err, scope);
  }
};
