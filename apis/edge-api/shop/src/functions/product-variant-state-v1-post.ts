// POST /shop/v1/products/{id}/variants/{variantId}/state — put one variant on or off sale, or remove
// it, immediately (098 FR-009: stopping a sale never waits on review). 409 when it is the last on sale.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapProductError, toDetailDTO } from "../products/handler-support";
import { setVariantState } from "../products/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  const parsed = parseJsonBody<{ state?: unknown }>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "a JSON body is required", scope, parsed.errors);
  }
  try {
    const detail = await setVariantState(g.shopId, event.pathParameters?.id ?? "", event.pathParameters?.variantId ?? "", parsed.value);
    return json(200, toDetailDTO(detail), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
