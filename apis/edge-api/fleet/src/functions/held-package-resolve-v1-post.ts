import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem } from "@effy/edge-shared";
import { announce } from "@effy/edge-shared/live";
import type { ResolveHoldRequest, StaffActionResponse } from "@effy/shared-types";

import { SequenceActionError, resolveHold } from "../sequence/service";
import { denied, guard } from "../shared/handler-support";

/**
 * POST /fleet/v1/held-packages/{holdId}/resolve (093) — decide a package a driver declared missing:
 * found (it is planned again on the next pass) or lost (never planned again).
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;

  const holdId = event.pathParameters?.holdId;
  if (!holdId) return problem(400, "invalid_request", "Missing package", "A hold id is required.", scope);

  let body: ResolveHoldRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as ResolveHoldRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", scope);
  }
  if (body?.resolution !== "found" && body?.resolution !== "lost") {
    return problem(422, "validation_failed", "Cannot record that", "Choose found or lost.", scope, [
      { field: "resolution", message: "found or lost." },
    ]);
  }

  try {
    const r = await resolveHold(holdId, body.resolution, g.sub);
    await announce([{ scope: "ops", kind: "dispatch" }, { scope: "ops", kind: "orders" }]);
    const response: StaffActionResponse = { message: r.message };
    return json(200, response, scope);
  } catch (err) {
    if (err instanceof SequenceActionError) return problem(err.status, err.code, "Not done", err.sentence, scope);
    throw err;
  }
};
