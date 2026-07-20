// GET /shop/v1/fulfillments/{id} — the pick screen (020, US2).
//
// Side effect: a `pending` portion becomes `received` — opening it IS the acknowledgement (FR-011a).
// The underlying UPDATE is guarded, so concurrent opens still produce exactly one transition.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapFulfillmentError, toDetailDTO } from "../fulfillments/handler-support";
import { getDetail } from "../fulfillments/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  const id = event.pathParameters?.id;
  if (!id) return mapFulfillmentError(new Error("missing id"), scope);

  try {
    return json(200, toDetailDTO(await getDetail(g.actor, id)), scope);
  } catch (err) {
    // A portion belonging to another shop surfaces here as not_found and is mapped to the uniform
    // 403 — response codes must not be usable to enumerate other shops' orders (SC-007).
    return mapFulfillmentError(err, scope);
  }
};
