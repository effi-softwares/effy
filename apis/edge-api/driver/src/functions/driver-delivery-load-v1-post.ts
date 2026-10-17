import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { LoadRequest, LoadResponse } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { announceHeld, announceStop } from "../work/announce";
import { MISSING_REASONS, loadRun } from "../work/load";
import { RoundNotOpenError, roundNotOpenProblem } from "../work/open";
import { SequenceError, sequenceProblem } from "../work/sequence";
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
  // 093 — a package not loaded needs a reason, and "Other" needs a note.
  for (const n of body.notLoaded ?? []) {
    if (!n.packageId && !n.packageCode) {
      return problem(422, "validation_failed", "Cannot record that", "Say which package was not loaded.", guard.scope, [
        { field: "notLoaded", message: "A packageId or packageCode is required." },
      ]);
    }
    if (!MISSING_REASONS.has(n.reason)) {
      return problem(422, "validation_failed", "Cannot record that", "That is not a reason a package can be left behind for.", guard.scope, [
        { field: "reason", message: "Unknown reason." },
      ]);
    }
    if (n.reason === "other" && !n.note?.trim()) {
      return problem(422, "validation_failed", "Cannot record that", "Tell us what happened, so someone can follow it up.", guard.scope, [
        { field: "note", message: "A note is required for Other." },
      ]);
    }
  }

  try {
    const { loadedDropIds, held, dropsRemoved } = await loadRun(runId, guard.driver.id, body.changeId, body.packages, body.notLoaded ?? []);
    // 073 — each drop now reads "Out for delivery" on its shops' and back-office's screens.
    for (const dropId of loadedDropIds) await announceStop(dropId);
    if (held > 0) await announceHeld();
    guard.scope.log.info({ runId, loaded: loadedDropIds.length, held, dropsRemoved }, "driver.run_loaded");
    const response: LoadResponse = { loaded: loadedDropIds.length, held, dropsRemoved };
    return json(200, response, guard.scope);
  } catch (err) {
    if (err instanceof RoundNotOpenError) return roundNotOpenProblem(err, guard.scope);
    if (err instanceof SequenceError) return sequenceProblem(err, guard.scope);
    if (err instanceof NotFoundError) return problem(404, "not_found", "Not available", "That run is not available.", guard.scope);
    throw err;
  }
};
