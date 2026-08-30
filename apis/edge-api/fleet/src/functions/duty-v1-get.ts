// GET /fleet/v1/duty — who is working right now, and what is waiting (056 US4, FR-034…FR-036).
// Read = any active back-office staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapFleetError } from "../shared/handler-support";
import { readDuty } from "../duty/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await readDuty(), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
