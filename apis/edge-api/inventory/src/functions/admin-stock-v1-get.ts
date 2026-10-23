// Any active staff, csa included: support must see the number a shop is ringing about.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json } from "@effy/edge-shared";

import { backOfficeGate, mapStockError } from "../stock/handler-support";
import * as service from "../stock/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await backOfficeGate(event, context, "read");
  if (!g.ok) return g.response;

  const variantId = event.pathParameters?.variantId;
  if (!variantId) return mapStockError(new Error("missing variantId"), g.scope);

  try {
    return json(200, await service.getStock(g.actor, variantId), g.scope);
  } catch (err) {
    return mapStockError(err, g.scope);
  }
};
