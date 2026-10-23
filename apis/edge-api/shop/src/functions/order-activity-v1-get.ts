// Separate from the detail read: the log can be long and the sheet is opened on demand.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapOrderError, toActivityDTO } from "../orders/handler-support";
import { getActivity } from "../orders/service";

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
    return json(200, toActivityDTO(await getActivity(g.actor, id)), scope);
  } catch (err) {
    return mapOrderError(err, scope);
  }
};
