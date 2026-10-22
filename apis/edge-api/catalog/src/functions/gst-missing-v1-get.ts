// GET /catalog/v1/gst/missing — live products with no GST status yet (096 US9, FR-092). Read = any
// active staff incl. csa: knowing what is unclassified is how it gets done.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { missing } from "../gst/service";
import { denied, guard, mapReviewError } from "../review/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await missing(), scope);
  } catch (err) {
    return mapReviewError(err, scope);
  }
};
