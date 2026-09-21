import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";
import { collectionStop, NotFoundError } from "../work/service";

/** GET /driver/v1/collection/runs/{runId}/stops/{stopId} — the manifest for one shop (063). */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  const runId = event.pathParameters?.runId;
  const stopId = event.pathParameters?.stopId;
  if (!runId || !stopId) return problem(400, "invalid_request", "Missing identifiers", "A run and stop id are required.", guard.scope);

  try {
    return json(200, await collectionStop(runId, stopId, guard.driver.id), guard.scope);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return problem(404, "not_found", "Not available", "That stop is not available.", guard.scope);
    }
    throw err;
  }
};
