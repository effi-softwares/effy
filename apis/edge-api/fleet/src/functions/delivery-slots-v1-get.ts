// GET /fleet/v1/delivery-slots — every delivery window with its load today (069 US5) and on each
// Effy delivery day after it (078 US8). Read = any active staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import { listSlotsWithDays } from "../slots/service";
import { denied, guard, mapFleetError } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await listSlotsWithDays(), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
