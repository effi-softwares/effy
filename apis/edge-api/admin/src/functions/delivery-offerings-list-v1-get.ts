// GET /admin/v1/delivery-offerings — the rate grid (paged, filterable by origin/dest zone). Read
// access: any active back-office staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError, toOfferingListDTO } from "../delivery/handler-support";
import { listOfferings } from "../delivery/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  const qp = event.queryStringParameters ?? {};
  try {
    const page = await listOfferings({
      page: qp.page ? Number(qp.page) : undefined,
      pageSize: qp.pageSize ? Number(qp.pageSize) : undefined,
      originZoneId: qp.originZoneId ?? undefined,
      destinationZoneId: qp.destinationZoneId ?? undefined,
    });
    return json(200, toOfferingListDTO(page), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
