import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery, preamble } from "@effy/edge-shared";

import { guard, mapShopError, toListItemDTO } from "../shops/handler-support";
import { SHOP_LIST_SPEC } from "../shops/list";
import { listShops, shopViewCounts } from "../shops/service";

/** The shop register: a console list (103) — `?views=only` answers its status counts instead of a page. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    const req = parseListQuery(event.queryStringParameters, SHOP_LIST_SPEC);
    if (req.viewsOnly) return json(200, { views: await shopViewCounts(req) }, scope);
    const page = await listShops(req);
    return json(200, { ...page, items: page.items.map(toListItemDTO) }, scope);
  } catch (err) {
    return listProblem(err, scope) ?? mapShopError(err, scope);
  }
};
