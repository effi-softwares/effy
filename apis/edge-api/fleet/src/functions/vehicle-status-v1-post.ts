// POST /fleet/v1/vehicles/{vehicleId}/status — active ↔ off_road ↔ retired (061 US1, FR-008).
// Mutate = admin/manager only.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { VehicleStatusRequest } from "@effy/shared-types";

import { setVehicleStatus } from "../vehicles/service";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<VehicleStatusRequest>(event.body);
    return json(200, await setVehicleStatus(event.pathParameters?.vehicleId ?? "", body, g.sub, scope), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
