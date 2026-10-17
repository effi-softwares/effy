import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem } from "@effy/edge-shared";
import type { StaffActionResponse, WaiveSequenceRequest } from "@effy/shared-types";

import { announceDispatch } from "../lib/live";
import { SequenceActionError, waiveSequence } from "../sequence/service";
import { denied, guard } from "../shared/handler-support";

/**
 * POST /fleet/v1/dispatch/rounds/{id}/waive-sequence (093) — let one run skip the cross-run gate
 * (load while still holding collected or to-return parcels; collect with deliveries open), with a
 * reason. For a driver whose phone failed at the hub, not a way round the order of work.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;

  const roundId = event.pathParameters?.id;
  if (!roundId) return problem(400, "invalid_request", "Missing round", "A round id is required.", scope);

  let body: WaiveSequenceRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as WaiveSequenceRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", scope);
  }
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 500) {
    return problem(422, "validation_failed", "Cannot record that", "Say why, in a few words.", scope, [
      { field: "reason", message: "3 to 500 characters." },
    ]);
  }

  try {
    const r = await waiveSequence(roundId, reason, g.sub);
    await announceDispatch([r.driverId]);
    const response: StaffActionResponse = { message: r.message };
    return json(200, response, scope);
  } catch (err) {
    if (err instanceof SequenceActionError) return problem(err.status, err.code, "Not done", err.sentence, scope);
    throw err;
  }
};
