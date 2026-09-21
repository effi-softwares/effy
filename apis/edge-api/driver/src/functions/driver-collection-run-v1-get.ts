import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";
import { collectionRun, NotFoundError } from "../work/service";

/**
 * GET /driver/v1/collection/runs/{runId} — the shops on this driver's collection round (063).
 *
 * ⚠ A run belonging to ANOTHER driver answers exactly as a non-existent one does (FR-038). Telling
 * them apart would make this route an oracle for which run ids are real — 052 made the same two
 * refusals byte-identical for that reason.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  const runId = event.pathParameters?.runId;
  if (!runId) return problem(400, "invalid_request", "Missing run id", "A run id is required.", guard.scope);

  try {
    return json(200, await collectionRun(runId, guard.driver.id), guard.scope);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return problem(404, "not_found", "Not available", "That run is not available.", guard.scope);
    }
    throw err;
  }
};
