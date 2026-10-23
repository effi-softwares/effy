// Admin/manager only. The same service as the shop's route; only the gate differs.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, problem, ProblemType } from "@effy/edge-shared";

import { backOfficeGate, mapStockError } from "../stock/handler-support";
import * as service from "../stock/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await backOfficeGate(event, context, "write");
  if (!g.ok) return g.response;

  const variantId = event.pathParameters?.variantId;
  if (!variantId) return mapStockError(new Error("missing variantId"), g.scope);

  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", g.scope, parsed.errors);
  }

  try {
    return json(200, await service.setTracking(g.actor, variantId, parsed.value), g.scope);
  } catch (err) {
    return mapStockError(err, g.scope);
  }
};
