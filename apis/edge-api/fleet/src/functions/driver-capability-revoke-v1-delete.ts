// Admin/manager. Not held returns 200, not a 404.
import { announceDispatch } from "../lib/live";
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { revokeCapability } from "../capabilities/service";
import { denied, guard, mapFleetError } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const items = await revokeCapability(
      event.pathParameters?.driverId ?? "",
      event.pathParameters?.capabilityId ?? "",
      g.sub,
      scope,
    );
    await announceDispatch();
    return json(200, { items }, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
