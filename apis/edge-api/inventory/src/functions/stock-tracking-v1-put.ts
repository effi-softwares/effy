// PUT /inventory/v1/products/{productId}/stock/tracking — turn stock tracking on or off (054 US1, FR-002/FR-003).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, problem, ProblemType } from "@effy/edge-shared";

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

  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", g.scope, parsed.errors);
  }

  try {
    return json(200, await service.setTracking(g.actor, productId, parsed.value), g.scope);
  } catch (err) {
    return mapStockError(err, g.scope);
  }
};
