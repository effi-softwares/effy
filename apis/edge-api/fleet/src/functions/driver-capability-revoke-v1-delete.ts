// DELETE /fleet/v1/drivers/{driverId}/capabilities/{capabilityId} — revoke one (062 FR-003).
// Mutate = admin/manager only.
//
// ⚠ Revoking a clearance the driver does not hold returns 200, NOT a 404 (FR-006). The operator's
// intent is already true; erroring would make two operators tidying the same record fight.
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
    return json(200, { items }, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
