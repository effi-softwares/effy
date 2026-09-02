// PATCH /shop/v1/purchase-orders/{id} — edit a draft, or send/cancel it (057 US6).
//
// ⚠ `received` is NOT settable here. It is derived from the lines when goods actually arrive
// (see /receive); a client that could assert it would close an order with stock still outstanding.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapProductError } from "../products/handler-support";
import { updatePurchaseOrder } from "../purchase-orders/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "a JSON body is required", scope, parsed.errors);
  }
  try {
    return json(200, await updatePurchaseOrder(g.shopId, event.pathParameters?.id ?? "", parsed.value), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
