// POST /shop/v1/products/{id}/media — mint a presigned direct-to-S3 upload url + object key.
// Validates content-type + size (FR-026). Product must belong to the caller's shop.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapProductError } from "../products/handler-support";
import { presignUpload } from "../products/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  const parsed = parseJsonBody<{ contentType?: unknown; fileSize?: unknown }>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "a JSON body is required", scope, parsed.errors);
  }
  try {
    const out = await presignUpload(g.shopId, event.pathParameters?.id ?? "", parsed.value.contentType, parsed.value.fileSize);
    return json(200, out, scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
