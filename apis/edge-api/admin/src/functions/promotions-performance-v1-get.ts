// GET /admin/v1/promotions/{id}/performance — 094. Read: any active staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { performance } from "../promotions/promotion-extras";
import { guard, mapPromoError } from "../promotions/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  const id = event.pathParameters?.id ?? "";
  try {
    return json(200, await performance(id), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
