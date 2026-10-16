import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { LoadRequest, LoadResponse } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { announceStop } from "../work/announce";
import { loadRun } from "../work/load";
import { RoundNotOpenError, roundNotOpenProblem } from "../work/open";
import { NotFoundError } from "../work/service";

/**
 * POST /driver/v1/delivery/runs/{runId}/load (090) — the van is loaded: every staged drop on the run
 * goes out for delivery together. "Not yours" and "no such run" are one 404 (052's rule).
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  const runId = event.pathParameters?.runId;
  if (!runId) return problem(400, "invalid_request", "Missing run", "A runId is required.", guard.scope);

  let body: LoadRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as LoadRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", guard.scope);
  }
  if (!body?.changeId) {
    return problem(422, "validation_failed", "Cannot record that", "A changeId is required.", guard.scope, [
      { field: "changeId", message: "A changeId is required." },
    ]);
  }

  try {
    const { loadedDropIds } = await loadRun(runId, guard.driver.id, body.changeId, body.packages);
    // 073 — each drop now reads "Out for delivery" on its shops' and back-office's screens.
    for (const dropId of loadedDropIds) await announceStop(dropId);
    guard.scope.log.info({ runId, loaded: loadedDropIds.length }, "driver.run_loaded");
    const response: LoadResponse = { loaded: loadedDropIds.length };
    return json(200, response, guard.scope);
  } catch (err) {
    if (err instanceof RoundNotOpenError) return roundNotOpenProblem(err, guard.scope);
    if (err instanceof NotFoundError) return problem(404, "not_found", "Not available", "That run is not available.", guard.scope);
    throw err;
  }
};
