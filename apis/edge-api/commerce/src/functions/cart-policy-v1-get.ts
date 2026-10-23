// Public: a guest cart needs the minimum spend and the ceilings without a server cart.
import { ConnectionLimitError, formatCents, internal, json } from "@effy/edge-shared";

import { publicRoute } from "../lib/route";
import { cartPolicy } from "../lib/wiring";

export const handler = publicRoute(async ({ scope }) => {
  try {
    const p = await cartPolicy();
    return json(200, {
      minimumSubtotalAmount: formatCents(p.minimumSubtotalCents),
      currency: p.currency,
      maxLineQuantity: p.maxLineQuantity,
      maxDistinctItems: p.maxDistinctItems,
    }, scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "cart: policy read failed");
    return internal(scope);
  }
});
