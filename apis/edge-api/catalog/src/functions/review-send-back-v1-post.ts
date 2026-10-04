// POST /catalog/v1/review/items/{productId}/send-back — send a new product or a pending change back
// with a written reason (067 FR-012). Decide = admin/manager, from the staff record.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapReviewError, parseBody } from "../review/handler-support";
import { sendBack } from "../review/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "decide");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<{ version?: unknown; reason?: unknown }>(event.body);
    return json(200, await sendBack(event.pathParameters?.productId, body, g.sub), scope);
  } catch (err) {
    return mapReviewError(err, scope);
  }
};
