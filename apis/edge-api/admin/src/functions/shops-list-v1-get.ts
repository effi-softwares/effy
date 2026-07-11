// GET /admin/v1/shops — the shop register (paginated, filterable, searchable). Read access: any
// active back-office staff incl. csa (FR-003/FR-014). Server-side paging/search (A12).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapShopError, toListDTO } from "../shops/handler-support";
import { listShops } from "../shops/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  const qp = event.queryStringParameters ?? {};
  try {
    const page = await listShops({
      page: qp.page ? Number(qp.page) : undefined,
      pageSize: qp.pageSize ? Number(qp.pageSize) : undefined,
      status: qp.status ?? undefined,
      q: qp.q ?? undefined,
    });
    return json(200, toListDTO(page), scope);
  } catch (err) {
    return mapShopError(err, scope);
  }
};
