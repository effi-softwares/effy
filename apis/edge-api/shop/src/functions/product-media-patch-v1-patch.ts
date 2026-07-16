// PATCH /shop/v1/products/{id}/media/{mediaId} — reorder / set primary / alt text (US4).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapProductError, toMediaDTO } from "../products/handler-support";
import { patchMedia } from "../products/service";

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
    return json(200, toMediaDTO(await patchMedia(g.shopId, event.pathParameters?.id ?? "", event.pathParameters?.mediaId ?? "", parsed.value)), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
