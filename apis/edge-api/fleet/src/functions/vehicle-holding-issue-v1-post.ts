// POST /fleet/v1/vehicles/{vehicleId}/holdings — hand a vehicle to a driver (061 US2, FR-010).
// Mutate = admin/manager only.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { HoldingIssueRequest } from "@effy/shared-types";

import { issueVehicle } from "../holdings/service";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<HoldingIssueRequest>(event.body);
    return json(201, await issueVehicle(event.pathParameters?.vehicleId ?? "", body, g.sub, scope), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
