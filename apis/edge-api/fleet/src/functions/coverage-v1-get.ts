// GET /fleet/v1/coverage — every zone that cannot be served, and why (062 FR-016).
// Read = any active back-office staff, including csa.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { readCoverage } from "../coverage/service";
import { denied, guard, mapFleetError } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await readCoverage(), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
