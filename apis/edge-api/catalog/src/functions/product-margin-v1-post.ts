// POST /catalog/v1/products/{productId}/margin — set or change Effy's margin on an approved product
// (067 FR-032). The customer price follows at once. Decide = admin/manager, from the staff record.
import { announce } from "@effy/edge-shared/live";
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapReviewError, parseBody } from "../review/handler-support";
import { setMargin } from "../review/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "decide");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<{ margin?: unknown; expectedCurrent?: unknown }>(event.body);
    const margin = await setMargin(event.pathParameters?.productId, body, g.sub);
    await announce([{ scope: "ops", kind: "review" }]); // 071 — committed; the "no margin set" list changed
    return json(200, margin, scope);
  } catch (err) {
    return mapReviewError(err, scope);
  }
};
