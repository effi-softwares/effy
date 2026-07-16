// POST /shop/v1/products/{id}/status — lifecycle transition. Publish (→active) re-validates all
// mandatory fields (FR-010); archive is the default "remove".
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapProductError, toDetailDTO } from "../products/handler-support";
import { changeStatus } from "../products/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  const parsed = parseJsonBody<{ status?: unknown }>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "a JSON body is required", scope, parsed.errors);
  }
  try {
    return json(200, toDetailDTO(await changeStatus(g.shopId, event.pathParameters?.id ?? "", parsed.value)), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
