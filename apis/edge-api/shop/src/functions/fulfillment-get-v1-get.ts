// Opening a `pending` portion makes it `received`, guarded so concurrent opens make one transition.
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
    // Another shop's portion is not_found, answered as the uniform 403.
    return mapFulfillmentError(err, scope);
  }
};
