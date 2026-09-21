import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";
import { deliveryRun, NotFoundError } from "../work/service";

/** GET /driver/v1/delivery/runs/{runId} — this driver's same-day delivery round (063). */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  const runId = event.pathParameters?.runId;
  if (!runId) return problem(400, "invalid_request", "Missing run id", "A run id is required.", guard.scope);

  try {
    return json(200, await deliveryRun(runId, guard.driver.id), guard.scope);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return problem(404, "not_found", "Not available", "That run is not available.", guard.scope);
    }
    throw err;
  }
};
