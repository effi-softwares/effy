// GET /inventory/v1/products/{productId}/stock — a product's stock, its effective threshold and its
// recent movements (054 US1, FR-009).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json } from "@effy/edge-shared";

import { mapStockError, shopGate } from "../stock/handler-support";
import * as service from "../stock/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await shopGate(event, context);
  if (!g.ok) return g.response;

  const productId = event.pathParameters?.productId;
  if (!productId) return mapStockError(new Error("missing productId"), g.scope);

  try {
    return json(200, await service.getStock(g.actor, productId), g.scope);
  } catch (err) {
    return mapStockError(err, g.scope);
  }
};
