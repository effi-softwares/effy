// POST /catalog/v1/gst/bulk — set one GST status on many products (096 US9, FR-092). Decide =
// admin/manager, like approving a product: it changes what a customer's tax invoice will say.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { GstBulkRequest } from "@effy/shared-types";

import { bulkSet } from "../gst/service";
import { denied, guard, mapReviewError, parseBody } from "../review/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "decide");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<Partial<GstBulkRequest>>(event.body);
    // No announcement: no screen shows a product's GST status live.
    return json(200, await bulkSet(g.sub, body.productIds, body.gstStatus), scope);
  } catch (err) {
    return mapReviewError(err, scope);
  }
};
