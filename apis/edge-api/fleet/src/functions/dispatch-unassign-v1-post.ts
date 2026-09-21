import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem } from "@effy/edge-shared";

import { denied, guard } from "../shared/handler-support";
import { mapDispatchError } from "../shared/dispatch-handler-support";
 import { unassign } from "../dispatch/service";

/** POST /fleet/v1/dispatch/rounds/{id}/unassign (FR-030) — back to the pool, never lost. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  const id = event.pathParameters?.id;
  if (!id) return problem(400, "invalid_request", "Missing id", "A round id is required.", scope);
  const body = JSON.parse(event.body ?? "{}");
  if (!body.expectedUpdatedAt) {
    return problem(400, "invalid_request", "Missing fields", "An expectedUpdatedAt is required.", scope);
  }
  try {
    await unassign(id, body.expectedUpdatedAt, g.sub);
    return json(200, { ok: true }, scope);
  } catch (err) {
    return mapDispatchError(err, scope);
  }
};
