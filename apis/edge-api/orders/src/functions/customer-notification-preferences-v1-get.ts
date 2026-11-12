import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { ConnectionLimitError, internal, json, notFound, pooled } from "@effy/edge-shared";
import { readPreferences } from "@effy/edge-shared/notifications";
import type { StaffNotificationPreferencesDTO } from "@effy/shared-types";

import { requireStaff } from "../lib/guard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /orders/v1/customers/{customerId}/notification-preferences (111 US7): a customer's choices and consent, read
 * only, and (115) whether message email can reach them. There is no staff write: only the customer gives or withdraws
 * consent.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  const id = event.pathParameters?.customerId ?? "";
  if (!UUID.test(id)) return notFound(guard.scope);
  try {
    const found = await pooled.query<{ email: string | null; state: string | null }>(
      `SELECT c.email::text AS email, s.state FROM public.customer c
         LEFT JOIN public.email_delivery_status s ON s.address = c.email
        WHERE c.id = $1`,
      [id],
    );
    const row = found.rows[0];
    if (!row) return notFound(guard.scope);
    const { categories, consent } = await readPreferences(pooled, id);
    const body: StaffNotificationPreferencesDTO = {
      categories,
      consent,
      messageEmail: !row.email ? "no_address" : row.state === "undeliverable" || row.state === "complained" ? "suppressed" : "reachable",
    };
    return json(200, body, guard.scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    guard.scope.log.error({ err }, "customer notification preferences: read failed");
    return internal(guard.scope);
  }
};
