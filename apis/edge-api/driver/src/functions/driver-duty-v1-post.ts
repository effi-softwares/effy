import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";
import type { DutyRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { setDuty } from "../driver/service";

/**
 * POST /driver/v1/duty — go on/off duty (049). Duty status gates assignment (FR-005/006).
 *
 * ⚠ FR-011 (off-duty-mid-run guard) and the release of not-yet-collected work back to the pool are
 * enforced by the assignment worker + a guard on going off duty; this handler owns the session
 * transition. See T060.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  let body: DutyRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as DutyRequest;
  } catch {
    return problem(400, ProblemType.ValidationFailed, "Invalid request", "body must be JSON", guard.scope);
  }
  if (typeof body.onDuty !== "boolean") {
    return problem(400, ProblemType.ValidationFailed, "Invalid request", "onDuty (boolean) is required", guard.scope);
  }

  try {
    const result = await setDuty(guard.driver, body.onDuty);
    return json(200, result, guard.scope);
  } catch (err) {
    guard.scope.log.error({ err, driverId: guard.driver.id }, "duty: transition failed");
    return unavailable(guard.scope);
  }
};
