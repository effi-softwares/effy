import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { emitMetric, json, metricNamespace, problem } from "@effy/edge-shared";
import { ParcelReturnRoundNotFoundError } from "@effy/edge-shared/delivery";
import type { ParcelReturnRequest, ParcelReturnResponse } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { announceReturned } from "../work/announce";
import { RoundNotOpenError, roundNotOpenProblem } from "../work/open";
import { returnParcels } from "../work/return";
import { ParcelsUnaccounted, parcelsUnaccountedProblem } from "@effy/edge-shared/labels";

/**
 * Checks failed drops' parcels back in at the hub together. Nothing left is a success (`returned: 0`).
 * Idempotent on changeId. "Not yours" and "no such round" are one 404.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  const runId = event.pathParameters?.runId;
  if (!runId) return problem(400, "invalid_request", "Missing run", "A runId is required.", guard.scope);

  let body: ParcelReturnRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as ParcelReturnRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", guard.scope);
  }
  if (!body?.changeId) {
    return problem(422, "validation_failed", "Cannot record that", "A changeId is required.", guard.scope, [
      { field: "changeId", message: "A changeId is required." },
    ]);
  }

  try {
    const result = await returnParcels(runId, guard.driver.id, guard.driver.subject, body.changeId, body);

    if (!result.replayed && result.returned > 0) {
      emitMetric(metricNamespace(), "ParcelsReturned", result.returned);
      await announceReturned(runId);
    }
    guard.scope.log.info(
      { runId, returned: result.returned, roundComplete: result.roundComplete, replayed: result.replayed },
      "driver.parcels_returned",
    );

    const response: ParcelReturnResponse = { returned: result.returned, roundComplete: result.roundComplete };
    return json(200, response, guard.scope);
  } catch (err) {
    if (err instanceof RoundNotOpenError) return roundNotOpenProblem(err, guard.scope);
    if (err instanceof ParcelsUnaccounted) return parcelsUnaccountedProblem(err, guard.scope);
    if (err instanceof ParcelReturnRoundNotFoundError) {
      return problem(404, "not_found", "Not available", "That run is not available.", guard.scope);
    }
    throw err;
  }
};
