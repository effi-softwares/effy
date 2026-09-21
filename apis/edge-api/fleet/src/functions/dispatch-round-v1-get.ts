import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem } from "@effy/edge-shared";

import { denied, guard } from "../shared/handler-support";
import { mapDispatchError } from "../shared/dispatch-handler-support";
 import { readRound } from "../dispatch/service";

/** GET /fleet/v1/dispatch/rounds/{id} — one round: stops, order, holder (FR-027). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  const id = event.pathParameters?.id;
  if (!id) return problem(400, "invalid_request", "Missing id", "A round id is required.", scope);
  try {
    return json(200, await readRound(id), scope);
  } catch (err) {
    return mapDispatchError(err, scope);
  }
};
