// GET /catalog/v1/review/items/{productId} — one item with its before/after (067 FR-009, FR-010).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapReviewError } from "../review/handler-support";
import { item } from "../review/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await item(event.pathParameters?.productId), scope);
  } catch (err) {
    return mapReviewError(err, scope);
  }
};
