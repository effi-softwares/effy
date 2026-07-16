// PATCH /shop/v1/products/{id} — focused edit with optimistic concurrency (FR-023/FR-023a).
// Updates only the supplied subset; a stale expectedUpdatedAt → 409.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapProductError, toDetailDTO } from "../products/handler-support";
import { updateProduct } from "../products/service";

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
    return json(200, toDetailDTO(await updateProduct(g.shopId, event.pathParameters?.id ?? "", parsed.value)), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
