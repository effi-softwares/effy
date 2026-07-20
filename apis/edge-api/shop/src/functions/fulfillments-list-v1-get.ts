// GET /shop/v1/fulfillments — the shop's order queue (020, US1).
//
// Scoped to the caller's own shop by gate(); there is no shop parameter to supply. Ordered by
// delivery promise, which today IS strict FIFO (FR-001b, SC-020).
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

  // Anything other than an explicit `completed` reads the active queue — an unrecognised value must
  // never silently widen the result set.
  const state: QueueState = event.queryStringParameters?.state === "completed" ? "completed" : "active";

  try {
    return json(200, toQueueDTO(await listQueue(g.actor, state)), scope);
  } catch (err) {
    return mapFulfillmentError(err, scope);
  }
};
