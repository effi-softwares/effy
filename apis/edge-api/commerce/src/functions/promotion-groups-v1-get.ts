// GET /commerce/v1/promotion-groups?keys=home-hero,home-side — display groups for a SIGNED-IN shopper
// (094 US2). The storefront's public read answers everyone-audience promotions only; this one adds the
// first-order, new-customer and chosen-customer offers this shopper qualifies for and drops any they
// have used as often as allowed. Not cached: the answer is the shopper's own.
import { json } from "@effy/edge-shared";
import { groupPromotions } from "@effy/edge-shared/promotions";
import { pooled } from "@effy/edge-shared";

import { customerRoute } from "../lib/route";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const keys = (event.queryStringParameters?.keys ?? "").split(",").map((k) => k.trim()).filter(Boolean).slice(0, 12);
  return json(200, { groups: await groupPromotions(pooled, keys, { customerId: customer.id, now: new Date() }) }, scope);
});
