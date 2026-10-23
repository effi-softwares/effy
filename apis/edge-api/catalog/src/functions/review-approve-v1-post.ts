// Admin/manager only.
import { announce } from "@effy/edge-shared/live";
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapReviewError, parseBody } from "../review/handler-support";
import { approve } from "../review/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "decide");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<{ version?: unknown; margin?: unknown }>(event.body);
    const approved = await approve(event.pathParameters?.productId, body, g.sub);
    await announce([{ scope: "ops", kind: "review" }]);
    return json(200, approved, scope);
  } catch (err) {
    return mapReviewError(err, scope);
  }
};
