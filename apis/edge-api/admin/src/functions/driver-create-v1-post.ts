// POST /admin/v1/drivers — provision a driver (049). Mutate access: admin/manager. Cognito-first →
// record, one idempotent operation (research R9).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";
import type { AdminDriverCreateRequest } from "@effy/shared-types";

import { guard, mapDriverError } from "../drivers/handler-support";
import { createDriver } from "../drivers/service";

// parseJsonBody constrains its type param to Record<string, unknown>; parse loosely then narrow.

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "a JSON body is required", scope, parsed.errors);
  }
  try {
    return json(201, await createDriver(parsed.value as unknown as AdminDriverCreateRequest), scope);
  } catch (err) {
    return mapDriverError(err, scope);
  }
};
