// GET /shop/v1/orders/{id} — one order in the shop console (057 Amendment A3).
//
// `{id}` is the shop's PORTION (shop_fulfillment.id), exactly as on the pick route. Opening it
// acknowledges a `pending` portion (020 FR-011a). Another shop's portion and a missing one answer the
// SAME 403, so the route cannot be used to discover which order ids exist.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapOrderError, toOrderDTO } from "../orders/handler-support";
import { getOrder } from "../orders/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  const id = event.pathParameters?.id;
  if (!id) return mapOrderError(new Error("missing id"), scope);

  try {
    return json(200, toOrderDTO(await getOrder(g.actor, id)), scope);
  } catch (err) {
    return mapOrderError(err, scope);
  }
};
