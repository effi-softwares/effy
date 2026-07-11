// DELETE /admin/v1/shops/{shopId} — guarded removal (US6/FR-006). Mutate access. Dependent-free
// only; a shop with users returns 409 (disable instead).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { preamble } from "@effy/edge-shared";

import { guard, mapShopError } from "../shops/handler-support";
import { removeShop } from "../shops/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  const shopId = event.pathParameters?.shopId ?? "";
  try {
    await removeShop(shopId, g.sub);
    return { statusCode: 204, headers: { "x-request-id": scope.requestId }, body: "" };
  } catch (err) {
    return mapShopError(err, scope);
  }
};
