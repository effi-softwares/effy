// A union over the existing audit trails; writes nothing. Open to both shop roles.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { readActivity } from "../team-activity/service";
import { gate, mapTodayError } from "../today/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  try {
    return json(200, await readActivity(g.actor.shopId), scope);
  } catch (err) {
    return mapTodayError(err, scope);
  }
};
