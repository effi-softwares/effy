import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { ConnectionLimitError, forbidden, hasStaffRole, internal, json, pooled, refused, withTransaction } from "@effy/edge-shared";

import { objectBody } from "../customers/respond";
import { requireWriter } from "../lib/guard";
import {
  NotificationSettingsForbidden,
  NotificationSettingsInvalid,
  parseNotificationSettings,
  readNotificationSettings,
  updateNotificationSettings,
} from "../notification-settings/service";

/**
 * PUT /orders/v1/notifications/settings (111 FR-020): admin and manager set the promotion limits; every changed field
 * is recorded. Nothing a screen shows live changes, so nothing is announced.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireWriter(event, context);
  if (!guard.ok) return guard.response;
  let update;
  try {
    update = parseNotificationSettings(objectBody(event.body));
  } catch (err) {
    if (err instanceof NotificationSettingsInvalid) return refused(guard.scope, 400, "invalid_notification_settings", err.message);
    throw err;
  }
  try {
    const admin = await hasStaffRole(guard.sub, ["admin"]);
    await withTransaction((tx) => updateNotificationSettings(tx, guard.sub, update, admin));
    return json(200, await readNotificationSettings(pooled), guard.scope);
  } catch (err) {
    if (err instanceof NotificationSettingsForbidden) return forbidden(guard.scope);
    if (err instanceof ConnectionLimitError) throw err;
    guard.scope.log.error({ err }, "notification settings: update failed");
    return internal(guard.scope);
  }
};
