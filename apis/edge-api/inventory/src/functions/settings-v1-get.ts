// GET /inventory/v1/settings — the shop's default low-stock threshold (054, FR-005).
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
    return json(200, await service.getSettings(g.actor), g.scope);
  } catch (err) {
    return mapStockError(err, g.scope);
  }
};
