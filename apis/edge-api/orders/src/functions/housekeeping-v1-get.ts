import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { ConnectionLimitError, hasStaffRole, internal, json, pooled } from "@effy/edge-shared";

import { readHousekeeping } from "../housekeeping/service";
import { requireStaff } from "../lib/guard";

/** GET /orders/v1/housekeeping (113 US5): the clean-ups and the abandon time. Any active staff; only admins may edit. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  try {
    const admin = await hasStaffRole(guard.sub, ["admin"]);
    return json(200, await readHousekeeping(pooled, new Date(), admin), guard.scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    guard.scope.log.error({ err }, "housekeeping: read failed");
    return internal(guard.scope);
  }
};
