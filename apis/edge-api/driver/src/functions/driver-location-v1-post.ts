import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";
import type { LocationRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { recordLocation } from "../driver/service";

/**
 * POST /driver/v1/location — an OPTIONAL point-in-time location snapshot (049). Read only at
 * assignment time for nearest-driver preference (research R2). The app NEVER continuously streams
 * GPS, and live driver location is not exposed to customers in this slice.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  let body: LocationRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as LocationRequest;
  } catch {
    return problem(400, ProblemType.ValidationFailed, "Invalid request", "body must be JSON", guard.scope);
  }
  if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
    return problem(400, ProblemType.ValidationFailed, "Invalid request", "lat and lng (numbers) are required", guard.scope);
  }

  try {
    await recordLocation(guard.driver, body.lat, body.lng);
    return json(204, null, guard.scope);
  } catch (err) {
    guard.scope.log.error({ err, driverId: guard.driver.id }, "location: snapshot write failed");
    return unavailable(guard.scope);
  }
};
