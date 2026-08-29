// GET /inventory/v1/admin/shops/{shopId}/low-stock — any shop's restock list, read on their behalf
// (054 US4/US5, FR-025). Read tier: any active staff, incl. `csa`.
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
  try {
    return json(200, await service.listLowStock(g.actor), g.scope);
  } catch (err) {
    return mapStockError(err, g.scope);
  }
};
