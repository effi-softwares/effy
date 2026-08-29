// GET /inventory/v1/admin/shops/{shopId}/products/{productId}/stock — read any shop's stock and its
// movement history on their behalf (054 US4, FR-025).
//
// ⚠ READ is open to ANY active back-office staff INCLUDING `csa`. Triage is CSA work, and a support
// agent who cannot see the number a shop is ringing up about cannot help them. WRITING is the
// narrower tier — see the sibling handlers.
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

  const productId = event.pathParameters?.productId;
  if (!productId) return mapStockError(new Error("missing productId"), g.scope);

  try {
    return json(200, await service.getStock(g.actor, productId), g.scope);
  } catch (err) {
    return mapStockError(err, g.scope);
  }
};
