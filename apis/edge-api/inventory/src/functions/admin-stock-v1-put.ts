// PUT /inventory/v1/admin/shops/{shopId}/products/{productId}/stock — set a count on the shop's behalf (054 US4, FR-026).
//
// ⚠ WRITE is admin/manager only (FR-026/FR-028) — this changes another organisation's records on
// their behalf, which is the same tier 046 set for an outward reply and 053 for recording an arrival.
// ⚠ And it runs the SAME service as the shop's own route: only the gate and how the shop is resolved
// differ. Two copies of "what a valid stock change is" would drift, and the drift would show up as
// back-office being able to write something a shop cannot (research R6).
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

  const productId = event.pathParameters?.productId;
  if (!productId) return mapStockError(new Error("missing productId"), g.scope);

  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", g.scope, parsed.errors);
  }

  try {
    return json(200, await service.setCount(g.actor, productId, parsed.value), g.scope);
  } catch (err) {
    return mapStockError(err, g.scope);
  }
};
