// GET /admin/v1/delivery-zones/{id}/audit — the zone's change history (US4/FR-018), backed by
// admin.audit_log. Read access.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError, toAuditDTO } from "../delivery/handler-support";
import { getZoneHistory } from "../delivery/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  const zoneId = event.pathParameters?.id ?? "";
  const qp = event.queryStringParameters ?? {};
  try {
    const page = await getZoneHistory(
      zoneId,
      qp.page ? Number(qp.page) : undefined,
      qp.pageSize ? Number(qp.pageSize) : undefined,
    );
    return json(200, toAuditDTO(page), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
