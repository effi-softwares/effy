import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { announceCheckedIn } from "../work/announce";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { HubCheckinRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { hubCheckin } from "../work/complete";
import { NotFoundError } from "../work/service";
import { RoundNotOpenError, roundNotOpenProblem } from "../work/open";

/**
 * POST /driver/v1/hub/checkin (063, FR-022/FR-023).
 *
 * ⚠ The split in the response — Effy delivery (by day and window) and Courier — is READ, never
 * decided: who delivers was settled when the order was placed (079). The driver classifies nothing,
 * and a courier parcel's driver-side work ends here.
 */
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
    const checkedIn = await hubCheckin(body.runId, guard.driver.id);
    // 071/073 — committed; back-office AND every shop whose packages arrived see them "At hub".
    await announceCheckedIn(body.runId);
    return json(200, checkedIn, guard.scope);
  } catch (err) {
    // 072 — the round has not opened. Nothing was written; the answer says when it will.
    if (err instanceof RoundNotOpenError) return roundNotOpenProblem(err, guard.scope);
    if (err instanceof NotFoundError) {
      return problem(404, "not_found", "Not available", "That run is not available.", guard.scope);
    }
    throw err;
  }
};
