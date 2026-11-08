import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { ConnectionLimitError, internal, json, pooled } from "@effy/edge-shared";

import { requireStaff } from "../lib/guard";
import { readNotificationSettings } from "../notification-settings/service";

/** GET /orders/v1/notifications/settings (111): the promotion limits. Any active staff, as the settings page. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  try {
    return json(200, await readNotificationSettings(pooled), guard.scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    guard.scope.log.error({ err }, "notification settings: read failed");
    return internal(guard.scope);
  }
};
