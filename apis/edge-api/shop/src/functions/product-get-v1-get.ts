// GET /shop/v1/products/{id} — full detail, shop-scoped (404 if not this shop's).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapProductError, toDetailDTO } from "../products/handler-support";
import { getProduct } from "../products/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  try {
    return json(200, toDetailDTO(await getProduct(g.shopId, event.pathParameters?.id ?? "")), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
