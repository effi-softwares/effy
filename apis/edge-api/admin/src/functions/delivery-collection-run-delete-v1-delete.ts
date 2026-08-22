// DELETE /admin/v1/delivery/collection-runs/{runId} — remove a collection run (047 US2). Mutate.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import { guard, mapDeliveryError } from "../delivery/handler-support";
import { deleteCollectionRun } from "../delivery/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  const runId = event.pathParameters?.runId ?? "";
  try {
    return json(200, { items: await deleteCollectionRun(runId, g.sub) }, scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
