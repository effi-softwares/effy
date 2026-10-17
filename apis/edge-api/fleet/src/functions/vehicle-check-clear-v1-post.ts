import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem } from "@effy/edge-shared";
import type { ClearVehicleCheckRequest, StaffActionResponse } from "@effy/shared-types";

import { announceDispatch } from "../lib/live";
import { SequenceActionError, clearVehicleCheck } from "../sequence/service";
import { denied, guard } from "../shared/handler-support";

/**
 * POST /fleet/v1/vehicle-checks/{checkId}/clear (093) — the vehicle a driver found unsafe has been
 * fixed or swapped; they can be given work again.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;

  const checkId = event.pathParameters?.checkId;
  if (!checkId) return problem(400, "invalid_request", "Missing check", "A check id is required.", scope);

  let body: ClearVehicleCheckRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as ClearVehicleCheckRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", scope);
  }
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (note.length < 3 || note.length > 500) {
    return problem(422, "validation_failed", "Cannot record that", "Say what was done, in a few words.", scope, [
      { field: "note", message: "3 to 500 characters." },
    ]);
  }

  try {
    const r = await clearVehicleCheck(checkId, note, g.sub);
    await announceDispatch([r.driverId]);
    const response: StaffActionResponse = { message: r.message };
    return json(200, response, scope);
  } catch (err) {
    if (err instanceof SequenceActionError) return problem(err.status, err.code, "Not done", err.sentence, scope);
    throw err;
  }
};
