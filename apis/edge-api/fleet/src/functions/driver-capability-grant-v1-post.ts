// Admin/manager. Already held returns 200, not a conflict.
import { announceDispatch } from "../lib/live";
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { GrantCapabilityRequest } from "@effy/shared-types";

import { grantCapability } from "../capabilities/service";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<GrantCapabilityRequest>(event.body);
    const items = await grantCapability(event.pathParameters?.driverId ?? "", body, g.sub, scope);
    await announceDispatch();
    return json(200, { items }, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
