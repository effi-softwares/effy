// The signed-in version of the storefront's read: adds the offers this shopper qualifies for and drops
// those they have used up. Not cached.
import { json } from "@effy/edge-shared";
import { groupPromotions } from "@effy/edge-shared/promotions";
import { pooled } from "@effy/edge-shared";

import { customerRoute } from "../lib/route";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const keys = (event.queryStringParameters?.keys ?? "").split(",").map((k) => k.trim()).filter(Boolean).slice(0, 12);
  return json(200, { groups: await groupPromotions(pooled, keys, { customerId: customer.id, now: new Date() }) }, scope);
});
