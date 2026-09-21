import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { readCustody } from "../dispatch/custody";
import { mapDispatchError } from "../shared/dispatch-handler-support";
import { denied, guard } from "../shared/handler-support";

/**
 * GET /fleet/v1/custody — every package currently in a driver's hands (064, FR-014).
 *
 * Read = any active back-office staff including csa. Knowing where the goods are is triage, not a
 * change to anything.
 *
 * ⚠ Carries no address and no coordinate. The platform captures no driver location (FR-028), and the
 * question this answers is "who has it", not "where are they".
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    const driverId = event.queryStringParameters?.driverId ?? null;
    return json(200, { custody: await readCustody(driverId) }, scope);
  } catch (err) {
    return mapDispatchError(err, scope);
  }
};
