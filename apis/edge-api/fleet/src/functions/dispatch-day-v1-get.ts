import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem } from "@effy/edge-shared";

import { denied, guard } from "../shared/handler-support";
import { mapDispatchError } from "../shared/dispatch-handler-support";
 import { readDay } from "../dispatch/service";

/**
 * GET /fleet/v1/dispatch/day — the day's work (FR-027).
 *
 * Read = any active back-office staff, including csa: triage is CSA work, and seeing what is stuck is
 * not the same as changing it.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await readDay(), scope);
  } catch (err) {
    return mapDispatchError(err, scope);
  }
};
