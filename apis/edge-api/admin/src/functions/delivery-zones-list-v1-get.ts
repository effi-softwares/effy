// GET /admin/v1/delivery-zones — the zone register (paginated/filterable/searchable). Read access:
// any active back-office staff incl. csa (US4). Server-side paging/search.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError, toZoneListDTO } from "../delivery/handler-support";
import { listZones } from "../delivery/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  const qp = event.queryStringParameters ?? {};
  try {
    const page = await listZones({
      page: qp.page ? Number(qp.page) : undefined,
      pageSize: qp.pageSize ? Number(qp.pageSize) : undefined,
      status: qp.status ?? undefined,
      q: qp.q ?? undefined,
    });
    return json(200, toZoneListDTO(page), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
