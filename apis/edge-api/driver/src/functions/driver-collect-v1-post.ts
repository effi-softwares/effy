import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { announceCollected } from "../work/announce";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { CollectRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { collectStop } from "../work/complete";
import { ParcelsUnaccounted, parcelsUnaccountedProblem } from "@effy/edge-shared/labels";
import { NotFoundError } from "../work/service";
import { RoundNotOpenError, roundNotOpenProblem } from "../work/open";
import { SequenceError, sequenceProblem } from "../work/sequence";

/** Idempotent on the stop's state: a retry reads as success. */
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
  // Every package the driver was shown, each with its outcome; only these are settled.
  if (!Array.isArray(body.packages) || body.packages.length === 0) {
    return problem(400, "invalid_request", "Missing packages", "Say what happened to each package at this stop.", guard.scope);
  }

  try {
    const result = await collectStop(runId, stopId, guard.driver.id, body);
    await announceCollected(stopId);
    return json(200, { status: "collected", ...result }, guard.scope);
  } catch (err) {
    // The round has not opened: nothing was written.
    if (err instanceof RoundNotOpenError) return roundNotOpenProblem(err, guard.scope);
    if (err instanceof SequenceError) return sequenceProblem(err, guard.scope);
    if (err instanceof ParcelsUnaccounted) return parcelsUnaccountedProblem(err, guard.scope);
    if (err instanceof NotFoundError) {
      return problem(404, "not_found", "Not available", "That stop is not available.", guard.scope);
    }
    throw err;
  }
};
