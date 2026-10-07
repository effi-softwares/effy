import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, logger, preamble, problem } from "@effy/edge-shared";

import { isStage, mapAssignmentError } from "../assignments/handler-support";
import { unassign } from "../assignments/service";
import { announceDispatch } from "../lib/live";
import { denied, guard } from "../shared/handler-support";

/** POST /fleet/v1/dispatch/packages/{packageId}/unassign (073) — hand a package back to auto-assign. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  const packageId = event.pathParameters?.packageId;
  const body = JSON.parse(event.body ?? "{}");
  if (!packageId || !isStage(body.stage) || typeof body.expectedAssignmentId !== "string") {
    return problem(400, "invalid_request", "Missing fields", "A stage and expectedAssignmentId are required.", scope);
  }
  try {
    const result = await unassign({ packageId, stage: body.stage, expectedAssignmentId: body.expectedAssignmentId, actorSub: g.sub });
    logger.info({ action: "unassign", stage: body.stage, packageId }, "dispatch.manual");
    await announceDispatch(result.driverIds);
    return json(200, { message: result.message }, scope);
  } catch (err) {
    return mapAssignmentError(err, scope);
  }
};
