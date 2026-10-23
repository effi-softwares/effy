// Admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { HoldingReturnRequest } from "@effy/shared-types";

import { returnVehicle } from "../holdings/service";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<HoldingReturnRequest>(event.body ?? "{}");
    return json(200, await returnVehicle(event.pathParameters?.vehicleId ?? "", body, g.sub, scope), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
