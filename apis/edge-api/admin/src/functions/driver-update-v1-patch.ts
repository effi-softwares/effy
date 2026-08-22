// PATCH /admin/v1/drivers/{driverId} — update a driver's name/zone/vehicle (049). Mutate access.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";
import type { AdminDriverUpdateRequest } from "@effy/shared-types";

import { guard, mapDriverError } from "../drivers/handler-support";
import { updateDriver } from "../drivers/service";

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
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "a JSON body is required", scope, parsed.errors);
  }
  try {
    return json(200, await updateDriver(id, parsed.value as AdminDriverUpdateRequest), scope);
  } catch (err) {
    return mapDriverError(err, scope);
  }
};
