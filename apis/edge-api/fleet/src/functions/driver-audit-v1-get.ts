// GET /fleet/v1/drivers/{driverId}/audit — the profile's change history (056 US2, FR-025).
// Read = any active back-office staff. Accountability is not an admin-only privilege; a CSA asked
// "who suspended this driver" should be able to answer it.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { listDriverAudit } from "../shared/audit";
import { denied, guard, mapFleetError } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    const items = await listDriverAudit(event.pathParameters?.driverId ?? "");
    return json(200, { items }, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
