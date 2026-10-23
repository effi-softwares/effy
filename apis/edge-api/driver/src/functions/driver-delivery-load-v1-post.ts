import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { LoadRequest, LoadResponse } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { announceHeld, announceStop } from "../work/announce";
import { loadRun } from "../work/load";
import { ParcelsUnaccounted, parcelsUnaccountedProblem } from "@effy/edge-shared/labels";
import { RoundNotOpenError, roundNotOpenProblem } from "../work/open";
import { SequenceError, sequenceProblem } from "../work/sequence";
import { NotFoundError } from "../work/service";

/** Every staged drop goes out for delivery together. "Not yours" and "no such run" are one 404. */
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
  // A bag not loaded needs a reason ("Other" needs a note), or the whole load is refused.

  try {
    const { loadedDropIds, held, dropsRemoved } = await loadRun(runId, guard.driver.id, body.changeId, body.parcels, body.missingParcels ?? [], body.reads);
    for (const dropId of loadedDropIds) await announceStop(dropId);
    if (held > 0) await announceHeld();
    guard.scope.log.info({ runId, loaded: loadedDropIds.length, held, dropsRemoved }, "driver.run_loaded");
    const response: LoadResponse = { loaded: loadedDropIds.length, held, dropsRemoved };
    return json(200, response, guard.scope);
  } catch (err) {
    if (err instanceof RoundNotOpenError) return roundNotOpenProblem(err, guard.scope);
    if (err instanceof SequenceError) return sequenceProblem(err, guard.scope);
    if (err instanceof ParcelsUnaccounted) return parcelsUnaccountedProblem(err, guard.scope);
    if (err instanceof NotFoundError) return problem(404, "not_found", "Not available", "That run is not available.", guard.scope);
    throw err;
  }
};
