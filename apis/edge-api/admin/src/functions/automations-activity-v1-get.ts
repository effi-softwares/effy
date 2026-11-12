import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, preamble } from "@effy/edge-shared";

import { automationActivitySource } from "../messages/automations/activity";
import { guard, mapMessageError } from "../messages/handlers";

/** An automatic message's activity, newest first: one log in the activity drawer (115 FR-020; 104). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope);
  if ("deny" in g) return g.deny;
  try {
    return await activityResponse(event.queryStringParameters, scope, "bo-automation", async () => automationActivitySource(event.pathParameters?.id ?? ""));
  } catch (err) {
    return mapMessageError(err, scope);
  }
};
