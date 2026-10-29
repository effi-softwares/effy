// A union over the existing audit trails; writes nothing. Open to both shop roles. The activity drawer (104).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, preamble } from "@effy/edge-shared";

import { teamActivitySource } from "../activity/sources";
import { gate, mapTodayError } from "../today/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  try {
    return await activityResponse(event.queryStringParameters, scope, "shop-team", async () => teamActivitySource(g.actor.shopId));
  } catch (err) {
    return mapTodayError(err, scope);
  }
};
