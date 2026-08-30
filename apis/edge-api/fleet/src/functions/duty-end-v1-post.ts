// POST /fleet/v1/duty/{sessionId}/end — close a duty session left open (056 US4, FR-037).
// Write = admin/manager. Ending someone's shift for them is not a read.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapFleetError } from "../shared/handler-support";
import { endDutySession } from "../duty/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    await endDutySession(event.pathParameters?.sessionId ?? "", g.sub);
    return json(200, { ended: true }, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
