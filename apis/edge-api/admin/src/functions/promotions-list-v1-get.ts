// GET /admin/v1/promotions — the code register (paged; filter by status, search by code). Read access:
// any active back-office staff, including csa — answering "is this code still live?" is support work.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPromoError, toPromoListDTO } from "../promotions/handler-support";
import { listPromos } from "../promotions/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  const qp = event.queryStringParameters ?? {};
  try {
    const page = await listPromos({
      page: qp.page ? Number(qp.page) : undefined,
      pageSize: qp.pageSize ? Number(qp.pageSize) : undefined,
      status: qp.status ?? undefined,
      q: qp.q ?? undefined,
    });
    return json(200, toPromoListDTO(page), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
