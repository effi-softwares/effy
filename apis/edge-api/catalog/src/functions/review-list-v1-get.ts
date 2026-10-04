// GET /catalog/v1/review — the review queue (067 FR-006, FR-007). Read = any active staff incl. csa.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapReviewError } from "../review/handler-support";
import { queue } from "../review/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await queue(event.queryStringParameters ?? {}), scope);
  } catch (err) {
    return mapReviewError(err, scope);
  }
};
