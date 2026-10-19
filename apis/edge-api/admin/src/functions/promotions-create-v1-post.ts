// POST /admin/v1/promotions — create a promotion (094), a draft unless `publish`. Mutate: admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPromoError } from "../promotions/handler-support";
import { createPromotion } from "../promotions/promotion-service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    return json(201, await createPromotion(JSON.parse(event.body ?? "{}"), g.sub), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
