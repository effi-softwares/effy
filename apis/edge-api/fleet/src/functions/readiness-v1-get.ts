// GET /fleet/v1/readiness — the gaps, before an order is affected (056 US6, FR-044…FR-046).
// Read = any active back-office staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapFleetError } from "../shared/handler-support";
import { readReadiness } from "../readiness/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await readReadiness(), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
