// Scoped to the caller's own shop by gate. Ordered by the ready-by promise, which is FIFO.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapFulfillmentError, toQueueDTO } from "../fulfillments/handler-support";
import { listQueue } from "../fulfillments/service";
import type { QueueState } from "../fulfillments/types";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  // Anything but `completed` reads the active queue, so an unknown value never widens the result.
  const state: QueueState = event.queryStringParameters?.state === "completed" ? "completed" : "active";

  try {
    return json(200, toQueueDTO(await listQueue(g.actor, state)), scope);
  } catch (err) {
    return mapFulfillmentError(err, scope);
  }
};
