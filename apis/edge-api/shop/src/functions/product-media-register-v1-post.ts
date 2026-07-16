// POST /shop/v1/products/{id}/media/register — record an uploaded object. Product must belong to
// the caller's shop. Returns the media DTO (with a presigned GET url).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapProductError, toMediaDTO } from "../products/handler-support";
import { registerMedia } from "../products/service";

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
    return json(201, toMediaDTO(await registerMedia(g.shopId, event.pathParameters?.id ?? "", parsed.value)), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
