// POST /shop/v1/purchase-orders/{id}/receive — goods arrived (057 US6, FR-017e).
//
// ⚠ THE ONE ROUTE IN THIS FEATURE THAT MOVES STOCK. Quantities are ABSOLUTE cumulative totals, never
// deltas, so a double-tap on a shop tablet books the same pallet once. Every count change writes a
// `stock_movement` citing the purchase-order line, which is the paper trail the whole feature exists
// for: "why do we have 48 of these" is answerable months later.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapProductError } from "../products/handler-support";
import { receivePurchaseOrder } from "../purchase-orders/service";

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
    return json(200, await receivePurchaseOrder(g.shopId, event.pathParameters?.id ?? "", g.sub, parsed.value), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
