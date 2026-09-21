import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { HubCheckinRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { hubCheckin } from "../work/complete";
import { NotFoundError } from "../work/service";

/**
 * POST /driver/v1/hub/checkin (063, FR-022/FR-023).
 *
 * ⚠ The same-day/standard split in the response is READ, never decided. The shopper chose the method
 * at checkout (047); the driver classifies nothing, and a standard package's driver-side work ends
 * here (FR-024).
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
    return json(200, await hubCheckin(body.runId, guard.driver.id), guard.scope);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return problem(404, "not_found", "Not available", "That run is not available.", guard.scope);
    }
    throw err;
  }
};
