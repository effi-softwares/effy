import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, unavailable } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";
import { loadToday } from "../today/service";

/**
 * GET /driver/v1/today — the phase-aware home (049, FR-021): the current phase (collection /
 * same-day delivery / idle), the active run, and a counts-only "remaining today" total. No currency.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;
  try {
    return json(200, await loadToday(guard.driver.id), guard.scope);
  } catch (err) {
    guard.scope.log.error({ err, driverId: guard.driver.id }, "today: load failed");
    return unavailable(guard.scope);
  }
};
