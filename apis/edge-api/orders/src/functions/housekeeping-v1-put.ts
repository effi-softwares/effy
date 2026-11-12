import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { ConnectionLimitError, forbidden, hasStaffRole, internal, json, pooled, refused, withTransaction } from "@effy/edge-shared";
import { announce } from "@effy/edge-shared/live";

import { objectBody } from "../customers/respond";
import {
  HousekeepingForbidden,
  HousekeepingSettingsChanged,
  HousekeepingSettingsInvalid,
  parseHousekeepingSettings,
  readHousekeeping,
  updateHousekeepingSettings,
} from "../housekeeping/service";
import { requireStaff } from "../lib/guard";

/**
 * PUT /orders/v1/housekeeping/settings (113 FR-001): an administrator sets the abandon time (1 hour to 7 days); the change
 * is recorded, and back-office re-reads the page (live kind `housekeeping`).
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  let update;
  try {
    update = parseHousekeepingSettings(objectBody(event.body));
  } catch (err) {
    if (err instanceof HousekeepingSettingsInvalid) {
      return refused(guard.scope, 400, "invalid_settings", err.message, { errors: [{ field: "abandonAfterMinutes", message: err.message }] });
    }
    throw err;
  }
  try {
    const admin = await hasStaffRole(guard.sub, ["admin"]);
    const changed = await withTransaction((tx) => updateHousekeepingSettings(tx, guard.sub, update, admin));
    if (changed) await announce([{ scope: "ops", kind: "housekeeping" }]);
    return json(200, await readHousekeeping(pooled, new Date(), admin), guard.scope);
  } catch (err) {
    if (err instanceof HousekeepingForbidden) return forbidden(guard.scope);
    if (err instanceof HousekeepingSettingsChanged) {
      return refused(guard.scope, 409, "settings_changed", "the abandon time was changed by someone else - reload and try again");
    }
    if (err instanceof ConnectionLimitError) throw err;
    guard.scope.log.error({ err }, "housekeeping: settings update failed");
    return internal(guard.scope);
  }
};
