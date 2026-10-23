// `{id}` is the shop's portion (shop_fulfillment.id). Opening it acknowledges a `pending` portion.
// Another shop's portion and a missing one answer the same 403.
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
