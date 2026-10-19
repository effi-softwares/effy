// POST /admin/v1/promotions/{id}/actions — publish, pause, resume, end or archive (094). Mutate: admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPromoError } from "../promotions/handler-support";
import { actOn } from "../promotions/promotion-service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    const body = JSON.parse(event.body ?? "{}") as { action?: unknown };
    return json(200, await actOn(event.pathParameters?.id ?? "", body.action, g.sub), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
