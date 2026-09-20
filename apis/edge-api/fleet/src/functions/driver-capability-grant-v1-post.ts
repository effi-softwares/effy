// POST /fleet/v1/drivers/{driverId}/capabilities — grant one clearance (062 FR-003).
// Mutate = admin/manager only.
//
// ⚠ Granting a clearance the driver already holds returns 200, NOT a conflict (FR-005). Two operators
// doing it at once both succeed, and the outcome is correct either way.
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
    return json(200, { items }, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
