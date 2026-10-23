import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { announceCheckedIn, announceHeld } from "../work/announce";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { HubCheckinRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { hubCheckin } from "../work/complete";
import { ParcelsUnaccounted, parcelsUnaccountedProblem } from "@effy/edge-shared/labels";
import { NotFoundError } from "../work/service";
import { RoundNotOpenError, roundNotOpenProblem } from "../work/open";
import { SequenceError, sequenceProblem } from "../work/sequence";

/** The Effy/Courier split is read, never decided: who delivers was settled at placement. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  let body: HubCheckinRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as HubCheckinRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", guard.scope);
  }
  if (!body.runId || !body.changeId) {
    return problem(400, "invalid_request", "Missing fields", "A runId and changeId are required.", guard.scope);
  }

  try {
    const checkedIn = await hubCheckin(body.runId, guard.driver.id, { changeId: body.changeId, parcels: body.parcels, missingParcels: body.missingParcels, reads: body.reads });
    await announceCheckedIn(body.runId);
    if ((checkedIn.held ?? 0) > 0) await announceHeld();
    return json(200, checkedIn, guard.scope);
  } catch (err) {
    // The round has not opened: nothing was written.
    if (err instanceof RoundNotOpenError) return roundNotOpenProblem(err, guard.scope);
    if (err instanceof SequenceError) return sequenceProblem(err, guard.scope);
    if (err instanceof ParcelsUnaccounted) return parcelsUnaccountedProblem(err, guard.scope);
    if (err instanceof NotFoundError) {
      return problem(404, "not_found", "Not available", "That run is not available.", guard.scope);
    }
    throw err;
  }
};
