// GET /admin/v1/shops/{shopId}/audit — the viewable shop + user history (FR-016/SC-010). Read access.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapShopError, toAuditDTO } from "../shops/handler-support";
import { getShopHistory } from "../shops/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  const shopId = event.pathParameters?.shopId ?? "";
  const qp = event.queryStringParameters ?? {};
  try {
    const page = await getShopHistory(
      shopId,
      qp.page ? Number(qp.page) : undefined,
      qp.pageSize ? Number(qp.pageSize) : undefined,
    );
    return json(200, toAuditDTO(page), scope);
  } catch (err) {
    return mapShopError(err, scope);
  }
};
