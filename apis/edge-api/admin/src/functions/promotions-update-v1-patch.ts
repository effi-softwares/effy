// PATCH /admin/v1/promotions/{id} — edit a promotion (094). Once used, what it gives and who it is for are
// fixed (409 `promotion_used`); a stale `expectedUpdatedAt` is 409 `stale`. Mutate: admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPromoError } from "../promotions/handler-support";
import { updatePromotion } from "../promotions/promotion-service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    return json(200, await updatePromotion(event.pathParameters?.id ?? "", JSON.parse(event.body ?? "{}"), g.sub), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
