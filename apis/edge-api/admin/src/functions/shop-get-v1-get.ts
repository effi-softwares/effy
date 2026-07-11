// GET /admin/v1/shops/{shopId} — shop detail + roster. Read access (any active staff).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapShopError, toDetailDTO } from "../shops/handler-support";
import { getShop } from "../shops/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  const shopId = event.pathParameters?.shopId ?? "";
  try {
    return json(200, toDetailDTO(await getShop(shopId)), scope);
  } catch (err) {
    return mapShopError(err, scope);
  }
};
