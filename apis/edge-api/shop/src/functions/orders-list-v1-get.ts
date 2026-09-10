// GET /shop/v1/orders — the shop order console's list (057 Amendment A3).
//
// Scoped to the caller's own shop by gate(); there is no shop parameter to supply. Search, filters,
// sort and paging are all server-side so the per-tab counts cover EVERY state the shop holds, not
// just the page on screen. The pick queue (`/shop/v1/fulfillments`) is untouched — shop-mobile and the
// dashboard still read it.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapOrderError, toListDTO } from "../orders/handler-support";
import { listOrders, parseListQuery } from "../orders/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  try {
    const q = parseListQuery(event.queryStringParameters ?? null);
    return json(200, toListDTO(await listOrders(g.actor, q)), scope);
  } catch (err) {
    return mapOrderError(err, scope);
  }
};
