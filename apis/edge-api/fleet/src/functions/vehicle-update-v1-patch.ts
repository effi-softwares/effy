// PATCH /fleet/v1/vehicles/{vehicleId} — edit a vehicle (061 US1, FR-007).
// Mutate = admin/manager only.
//
// ⚠ The body is passed to the service EXACTLY as the form built it. A key present with `null` clears
// the field; a key absent leaves it alone. Do not "clean" this object — dropping nulls here silently
// restores the defect 056 fixed on drivers, where a zone once assigned could never be un-assigned.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { VehicleUpdateRequest } from "@effy/shared-types";

import { updateVehicle } from "../vehicles/service";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<VehicleUpdateRequest>(event.body);
    return json(200, await updateVehicle(event.pathParameters?.vehicleId ?? "", body, g.sub, scope), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
