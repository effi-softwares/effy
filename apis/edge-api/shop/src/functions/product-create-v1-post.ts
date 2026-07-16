// POST /shop/v1/products — create a shop-owned product (as a draft). Any active shop member;
// the product is bound to the caller's resolved shop (never client input).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapProductError, toDetailDTO } from "../products/handler-support";
import { createProduct } from "../products/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "a JSON body is required", scope, parsed.errors);
  }
  try {
    return json(201, toDetailDTO(await createProduct(g.shopId, parsed.value, g.sub)), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
