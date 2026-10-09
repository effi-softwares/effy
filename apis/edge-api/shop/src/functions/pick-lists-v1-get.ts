// GET /shop/v1/pick-lists — every order waiting to be picked, as printable documents (058, US4).
//
// Scoped to the caller's own shop by gate(); there is no shop parameter to supply. Deliberately a
// separate read from the order console's: this one carries no money and no payment state, because
// what it produces is paper for the shelves.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { readPickLists } from "../pick-lists/repository";
import { gate, mapTodayError } from "../today/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  try {
    const { lists, more } = await readPickLists(g.actor.shopId);
    return json(
      200,
      {
        lists: lists.map((l) => ({
          fulfillmentId: l.fulfillmentId,
          orderNumber: l.orderNumber,
          customerName: l.customerName,
          paidAt: l.paidAt.toISOString(),
          // ⚠ 079 declared `deliveredBy` on the pick list and this mapping never sent it (the body is
          // untyped here); 080 found it adding `courierPickup` beside it.
          deliveredBy: l.deliveredBy,
          ...(l.courierPickup ? { courierPickup: l.courierPickup } : {}),
          deliveryMethod: l.deliveryMethod,
          lines: l.lines,
        })),
        more,
      },
      scope,
    );
  } catch (err) {
    return mapTodayError(err, scope);
  }
};
