// GET /fleet/v1/vehicles/{vehicleId} — detail, current holder and full holding history (061 FR-016).
// Read = any active back-office staff, including csa.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { readVehicle } from "../vehicles/service";
import { denied, guard, mapFleetError } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await readVehicle(event.pathParameters?.vehicleId ?? ""), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
