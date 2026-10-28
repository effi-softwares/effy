// Search, filters, sort and paging are server-side so the per-tab counts cover every state, not just the page.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, preamble } from "@effy/edge-shared";

import { gate, mapOrderError, toListDTO } from "../orders/handler-support";
import { listOrders, parseOrderListQuery } from "../orders/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  try {
    const q = parseOrderListQuery(event.queryStringParameters ?? null);
    return json(200, toListDTO(await listOrders(g.actor, q)), scope);
  } catch (err) {
    return listProblem(err, scope) ?? mapOrderError(err, scope);
  }
};
