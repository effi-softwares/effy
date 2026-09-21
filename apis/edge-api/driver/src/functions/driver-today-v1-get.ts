import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";
import { today } from "../work/service";

/**
 * GET /driver/v1/today — what this driver should be doing now (063, FR-017/FR-036).
 *
 * ⚠ THIS ROUTE IS RESTORED, NOT NEW. `HttpTodayRepository.kt` has been calling it since 060 and
 * getting a 404: the teardown removed the work model and its whole API surface while the app's
 * client code stayed intact. The response shape is therefore the contract's `TodayDTO`, unchanged —
 * the backend matches the client here, not the other way round.
 *
 * ⚠ A driver with nothing assigned gets `phase: "idle"`, not an error. "No work" and "we could not
 * ask" must not look the same on the one screen a driver checks all day.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;
  return json(200, await today(guard.driver.id), guard.scope);
};
