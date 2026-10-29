import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, preamble } from "@effy/edge-shared";

import { shopActivitySource } from "../shops/activity";
import { guard, mapShopError } from "../shops/handler-support";

/** A shop's activity, newest first: one log in the activity drawer (104). */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    return await activityResponse(event.queryStringParameters, scope, "bo-shop", async () =>
      shopActivitySource(event.pathParameters?.shopId ?? ""),
    );
  } catch (err) {
    return mapShopError(err, scope);
  }
};
