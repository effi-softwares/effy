import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { CollectRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { collectStop } from "../work/complete";
import { NotFoundError } from "../work/service";

/**
 * POST /driver/v1/collection/runs/{runId}/stops/{stopId}/collect (063, FR-026).
 *
 * ⚠ Idempotent on the stop's own state — a retry from a loading bay with bad signal reads as success,
 * not as a conflict the driver has to reason about (027's changeId rule, applied by state).
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  const runId = event.pathParameters?.runId;
  const stopId = event.pathParameters?.stopId;
  if (!runId || !stopId) {
    return problem(400, "invalid_request", "Missing identifiers", "A run and stop id are required.", guard.scope);
  }

  let body: CollectRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as CollectRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", guard.scope);
  }
  if (!body.changeId) {
    return problem(400, "invalid_request", "Missing changeId", "A changeId is required so a retry is recognised.", guard.scope);
  }

  try {
    await collectStop(runId, stopId, guard.driver.id, body);
    return json(200, { status: "collected" }, guard.scope);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return problem(404, "not_found", "Not available", "That stop is not available.", guard.scope);
    }
    throw err;
  }
};
