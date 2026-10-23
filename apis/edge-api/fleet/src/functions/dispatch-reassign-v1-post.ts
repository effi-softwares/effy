import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { announceDispatch, driverOfRound } from "../lib/live";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem } from "@effy/edge-shared";

import { denied, guard } from "../shared/handler-support";
import { mapDispatchError } from "../shared/dispatch-handler-support";
 import { reassign } from "../dispatch/service";

/** Admin/manager: moving physical work is an assertion about the world. */
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
    const previousDriver = await driverOfRound(id);
    await reassign(id, body.driverId, body.expectedUpdatedAt, g.sub);
    // Both drivers: the one who lost the round and the one who gained it.
    await announceDispatch([previousDriver, body.driverId]);
    return json(200, { ok: true }, scope);
  } catch (err) {
    return mapDispatchError(err, scope);
  }
};
