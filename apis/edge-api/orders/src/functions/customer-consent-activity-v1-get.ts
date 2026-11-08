import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, ConnectionLimitError, internal, notFound, pooled } from "@effy/edge-shared";

import { consentActivitySource } from "../activity/consent";
import { requireStaff } from "../lib/guard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /orders/v1/customers/{customerId}/consent/activity (111 US7): each yes and no, newest first, in the drawer (104). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  const id = event.pathParameters?.customerId ?? "";
  if (!UUID.test(id)) return notFound(guard.scope);
  try {
    const exists = await pooled.query(`SELECT 1 FROM public.customer WHERE id = $1`, [id]);
    if (exists.rowCount === 0) return notFound(guard.scope);
    return await activityResponse(event.queryStringParameters, guard.scope, "bo-customer-consent", async () => consentActivitySource(id));
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    guard.scope.log.error({ err }, "customer consent activity failed");
    return internal(guard.scope);
  }
};
