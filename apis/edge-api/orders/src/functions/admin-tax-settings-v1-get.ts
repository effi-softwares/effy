import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, unavailable } from "@effy/edge-shared";

import { requireAdmin } from "../lib/guard";
import { getTaxSettings } from "../tax-settings/service";

/** GET /orders/v1/admin/tax-settings — Effy's tax identity and whether invoices are on (096 US8). Admin only. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireAdmin(event, context);
  if (!guard.ok) return guard.response;
  try {
    return json(200, await getTaxSettings(), guard.scope);
  } catch (err) {
    guard.scope.log.error({ err }, "orders: tax settings read failed");
    return unavailable(guard.scope);
  }
};
