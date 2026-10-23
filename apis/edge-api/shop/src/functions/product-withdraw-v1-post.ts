// Takes a submission back out of the queue, or discards a pending change; the live product is untouched.
import { announce } from "@effy/edge-shared/live";
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapProductError, toDetailDTO } from "../products/handler-support";
import { withdraw } from "../products/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  try {
    const withdrawn = await withdraw(g.shopId, event.pathParameters?.id ?? "");
    await announce([{ scope: "ops", kind: "review" }]);
    return json(200, toDetailDTO(withdrawn), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
