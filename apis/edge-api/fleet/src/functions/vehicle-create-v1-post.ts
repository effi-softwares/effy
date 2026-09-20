// POST /fleet/v1/vehicles — add a vehicle to the register (061 US1, FR-001…FR-006).
// Mutate = admin/manager only.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { VehicleCreateRequest } from "@effy/shared-types";

import { createVehicle } from "../vehicles/service";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<VehicleCreateRequest>(event.body);
    return json(201, await createVehicle(body, g.sub, scope), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
