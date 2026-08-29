// GET /inventory/v1/low-stock — everything the caller's own shop needs to restock (054 US5, FR-029).
//
// ⚠ The eighth shop route. It is wired in Phase 7 with the feature it serves rather than alongside
// the per-product routes, because the analysis pass found it had a repository query and two screens
// and NO ENDPOINT BETWEEN THEM.
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
  try {
    return json(200, await service.listLowStock(g.actor), g.scope);
  } catch (err) {
    return mapStockError(err, g.scope);
  }
};
