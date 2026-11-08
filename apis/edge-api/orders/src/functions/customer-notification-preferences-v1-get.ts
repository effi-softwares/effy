import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { ConnectionLimitError, internal, json, notFound, pooled } from "@effy/edge-shared";
import { readPreferences } from "@effy/edge-shared/notifications";
import type { StaffNotificationPreferencesDTO } from "@effy/shared-types";

import { requireStaff } from "../lib/guard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /orders/v1/customers/{customerId}/notification-preferences (111 US7): a customer's choices and consent, read
 * only. There is no staff write: only the customer gives or withdraws consent.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  const id = event.pathParameters?.customerId ?? "";
  if (!UUID.test(id)) return notFound(guard.scope);
  try {
    const exists = await pooled.query(`SELECT 1 FROM public.customer WHERE id = $1`, [id]);
    if (exists.rowCount === 0) return notFound(guard.scope);
    const body: StaffNotificationPreferencesDTO = await readPreferences(pooled, id);
    return json(200, body, guard.scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    guard.scope.log.error({ err }, "customer notification preferences: read failed");
    return internal(guard.scope);
  }
};
