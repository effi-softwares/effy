import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, logger, preamble, problem } from "@effy/edge-shared";

import { isStage, mapAssignmentError } from "../assignments/handler-support";
import { assignTo } from "../assignments/service";
import { announceDispatch } from "../lib/live";
import { denied, guard } from "../shared/handler-support";

/**
 * POST /fleet/v1/dispatch/packages/{packageId}/assign (073) — "Assign to…". Gives a package to a
 * driver, whether nobody has it or someone else does. Mutate = admin/manager.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  const packageId = event.pathParameters?.packageId;
  const body = JSON.parse(event.body ?? "{}");
  if (!packageId || !isStage(body.stage) || typeof body.driverId !== "string" || body.expectedAssignmentId === undefined) {
    return problem(400, "invalid_request", "Missing fields", "A stage, a driverId and expectedAssignmentId are required.", scope);
  }
  try {
    const result = await assignTo({
      packageId,
      stage: body.stage,
      driverId: body.driverId,
      expectedAssignmentId: body.expectedAssignmentId,
      acceptConcerns: body.acceptConcerns === true,
      actorSub: g.sub,
    });
    logger.info({ action: "assign", stage: body.stage, packageId }, "dispatch.manual");
    // 071 — committed. Both drivers' apps, and back-office's order and dispatch screens.
    await announceDispatch(result.driverIds);
    return json(200, { message: result.message }, scope);
  } catch (err) {
    return mapAssignmentError(err, scope);
  }
};
