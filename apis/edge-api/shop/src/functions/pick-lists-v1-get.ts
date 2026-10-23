// Paper for the shelves: no money and no payment state.
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
          deliveredBy: l.deliveredBy,
          ...(l.courierPickup ? { courierPickup: l.courierPickup } : {}),
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
