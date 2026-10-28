import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery, preamble } from "@effy/edge-shared";

import { gate, mapProductError, toListDTO } from "../products/handler-support";
import { SHOP_PRODUCT_LIST_SPEC } from "../products/list";
import { listProducts } from "../products/service";

/** The shop's catalogue, a console list (103); the shop comes from the caller, never the query string. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  try {
    const req = parseListQuery(event.queryStringParameters, SHOP_PRODUCT_LIST_SPEC);
    return json(200, toListDTO(await listProducts(g.shopId, req)), scope);
  } catch (err) {
    return listProblem(err, scope) ?? mapProductError(err, scope);
  }
};
