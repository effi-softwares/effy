import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, preamble } from "@effy/edge-shared";

import { messagesReceivedSource } from "../messages/activity";
import { guard, mapMessageError } from "../messages/handlers";

/** The back-office messages one customer, driver or shop received (112 R16), as an activity log (104). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope);
  if ("deny" in g) return g.deny;
  const q = event.queryStringParameters ?? {};
  try {
    return await activityResponse(q, scope, "bo-messages-received", async () => messagesReceivedSource(q.audience, q.id));
  } catch (err) {
    return mapMessageError(err, scope);
  }
};
