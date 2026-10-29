// A product's stock activity in the shop's activity drawer (104): every size, or one (`sub`).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse } from "@effy/edge-shared";

import { stockActivitySource } from "../stock/activity";
import { mapStockError, shopGate } from "../stock/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await shopGate(event, context);
  if (!g.ok) return g.response;
  try {
    return await activityResponse(event.queryStringParameters, g.scope, "shop-stock", (req) =>
      stockActivitySource(g.actor, event.pathParameters?.productId ?? "", req),
    );
  } catch (err) {
    return mapStockError(err, g.scope);
  }
};
