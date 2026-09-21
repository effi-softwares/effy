import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem } from "@effy/edge-shared";

import { denied, guard } from "../shared/handler-support";
import { mapDispatchError } from "../shared/dispatch-handler-support";
 import { reassign } from "../dispatch/service";

/**
 * POST /fleet/v1/dispatch/rounds/{id}/reassign (FR-029, FR-034).
 *
 * ⚠ Mutate = admin/manager. Moving physical work is an assertion about the world, not a lookup —
 * the same reasoning 053 used for recording an order as arrived.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  const id = event.pathParameters?.id;
  if (!id) return problem(400, "invalid_request", "Missing id", "A round id is required.", scope);
  const body = JSON.parse(event.body ?? "{}");
  if (!body.driverId || !body.expectedUpdatedAt) {
    return problem(400, "invalid_request", "Missing fields", "A driverId and expectedUpdatedAt are required.", scope);
  }
  try {
    await reassign(id, body.driverId, body.expectedUpdatedAt, g.sub);
    return json(200, { ok: true }, scope);
  } catch (err) {
    return mapDispatchError(err, scope);
  }
};
