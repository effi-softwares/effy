// GET /admin/v1/delivery/collection-runs — the daily driver collection runs (047 US2). Read.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import { guard, mapDeliveryError } from "../delivery/handler-support";
import { listCollectionRuns } from "../delivery/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    return json(200, { items: await listCollectionRuns() }, scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
