// GET /admin/v1/drivers/{driverId} — one driver (049). Read access: any active staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem, ProblemType } from "@effy/edge-shared";

import { guard, mapDriverError } from "../drivers/handler-support";
import { getDriver } from "../drivers/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  const id = event.pathParameters?.driverId;
  if (!id) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "driverId is required", scope);
  }
  try {
    return json(200, await getDriver(id), scope);
  } catch (err) {
    return mapDriverError(err, scope);
  }
};
