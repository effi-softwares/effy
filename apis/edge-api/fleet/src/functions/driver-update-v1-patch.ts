// Admin/manager. The body is passed through as parsed: a key's presence is the signal (absent leaves alone, null clears).
import { announceDispatch } from "../lib/live";
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { AdminDriverUpdateRequest } from "@effy/shared-types";

import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";
import { updateDriver } from "../drivers/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<AdminDriverUpdateRequest>(event.body);
    const updated = await updateDriver(event.pathParameters?.driverId ?? "", body, g.sub, scope);
    await announceDispatch([event.pathParameters?.driverId]);
    return json(200, updated, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
