// GET /fleet/v1/stranded — work held by a driver who can no longer do it (056, FR-021).
// Read = any active back-office staff. ⚠ This state exists today and is invisible today; making it
// readable is most of the value of the route.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapFleetError } from "../shared/handler-support";
import { listStranded } from "../stranded/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await listStranded(), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
