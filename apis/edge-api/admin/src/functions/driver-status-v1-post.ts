// POST /admin/v1/drivers/{driverId}/status — activate/disable a driver (049). Mutate access.
// Disabling makes the driver's token non-authoritative at the driver service immediately (the record
// is authoritative, Principle IV) and disables the identity account (defense in depth).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { guard, mapDriverError } from "../drivers/handler-support";
import { setStatus } from "../drivers/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  const id = event.pathParameters?.driverId;
  if (!id) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "driverId is required", scope);
  }
  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  const status = parsed.value?.status;
  if (status !== "active" && status !== "disabled") {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "status must be 'active' or 'disabled'", scope);
  }
  try {
    return json(200, await setStatus(id, status), scope);
  } catch (err) {
    return mapDriverError(err, scope);
  }
};
