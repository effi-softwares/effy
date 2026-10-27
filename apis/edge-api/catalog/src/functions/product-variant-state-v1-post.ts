// One size on or off sale, from back-office (102). Removal stays the shop's. Admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { setVariantState } from "../products/controls";
import { denied, guard, mapProductAdminError, parseBody } from "../products/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "decide");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<{ version?: unknown; state?: unknown }>(event.body);
    return json(200, await setVariantState(event.pathParameters?.productId, event.pathParameters?.variantId, body, g.sub), scope);
  } catch (err) {
    return mapProductAdminError(err, scope);
  }
};
