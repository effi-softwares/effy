// POST /shop/v1/products/{id}/withdraw — 067-product-approval-margin.
// Withdraw: take a submitted product back out of Effy's queue, or discard the pending change on an
// approved one. The live product — if there is one — is never touched, so there is nothing to undo.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapProductError, toDetailDTO } from "../products/handler-support";
import { withdraw } from "../products/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  try {
    return json(200, toDetailDTO(await withdraw(g.shopId, event.pathParameters?.id ?? "")), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
