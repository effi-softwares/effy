// GET /admin/v1/promotions/{id}/audit — who created or changed this code, and when (027 FR-071).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { auditFor } from "../promotions/service";
import { guard, mapPromoError, toAuditDTO } from "../promotions/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    const entries = await auditFor(event.pathParameters?.id ?? "");
    return json(200, { items: entries.map(toAuditDTO) }, scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
