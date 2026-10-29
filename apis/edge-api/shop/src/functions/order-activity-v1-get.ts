// Separate from the detail read: the log can be long and the drawer is opened on demand (104).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, preamble } from "@effy/edge-shared";

import { orderActivitySource } from "../activity/sources";
import { FulfillmentError } from "../fulfillments/types";
import { gate, mapOrderError } from "../orders/handler-support";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  const id = event.pathParameters?.id ?? "";
  try {
    if (!UUID.test(id)) throw new FulfillmentError("not_found", "order not found");
    return await activityResponse(event.queryStringParameters, scope, "shop-order", () => orderActivitySource(g.actor, id));
  } catch (err) {
    return mapOrderError(err, scope);
  }
};
