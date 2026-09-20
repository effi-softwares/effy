// GET /fleet/v1/drivers/{driverId}/capabilities — everything this driver is cleared for (062 FR-007).
// Read = any active back-office staff, including csa.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { listCapabilities } from "../capabilities/service";
import { denied, guard, mapFleetError } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    const items = await listCapabilities(event.pathParameters?.driverId ?? "");
    return json(200, { items }, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
