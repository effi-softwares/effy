// POST /shop/v1/products/{id}/submit — 067-product-approval-margin.
// Submit a never-approved product for Effy's review. Runs the same readiness checks "publish" used to
// run; the product stays off sale until an Effy admin approves it and sets the margin.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapProductError, toDetailDTO } from "../products/handler-support";
import { submitForReview } from "../products/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  try {
    return json(200, toDetailDTO(await submitForReview(g.shopId, event.pathParameters?.id ?? "")), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
