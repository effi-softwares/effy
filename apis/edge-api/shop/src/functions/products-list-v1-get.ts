// GET /shop/v1/products — backend search/filter/sort/pagination, shop-scoped (SC-004, SC-005).
// Any active shop member; every row is this shop's only.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapProductError, toListDTO } from "../products/handler-support";
import { listProducts } from "../products/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  const qp = event.queryStringParameters ?? {};
  try {
    const page = await listProducts(g.shopId, {
      page: qp.page, pageSize: qp.pageSize, q: qp.q, type: qp.type, category: qp.category,
      section: qp.section, status: qp.status, priceMin: qp.priceMin, priceMax: qp.priceMax,
      sort: qp.sort, order: qp.order,
    });
    return json(200, toListDTO(page), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
