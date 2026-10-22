// PUT /commerce/v1/saved/{productId} — save a product. Idempotent. The optional body carries undo's
// `restoreSavedAt` and (098) the `variantId` the shopper had selected; a missing or unparseable body
// is fine.
import { customerRoute, jsonBody, pathParam } from "../lib/route";
import { savedService } from "../lib/wiring";
import { badBody, noContentOr, parseRfc3339 } from "../saved/respond";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  const raw = body?.restoreSavedAt;
  const variantId = typeof body?.variantId === "string" ? body.variantId : null;
  let restore: Date | null = null;
  if (raw !== undefined && raw !== null) {
    restore = parseRfc3339(raw);
    if (!restore) return badBody(scope, "invalid_restore_saved_at");
  }
  return noContentOr(scope, () => savedService.save(customer.id, pathParam(event, "productId"), restore, variantId));
});
