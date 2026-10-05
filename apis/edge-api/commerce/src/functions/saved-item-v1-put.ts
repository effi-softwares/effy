// PUT /commerce/v1/saved/{productId} — save a product. Idempotent. The optional body carries only
// undo's `restoreSavedAt`; a missing or unparseable body is fine.
import { customerRoute, jsonBody, pathParam } from "../lib/route";
import { savedService } from "../lib/wiring";
import { badBody, noContentOr, parseRfc3339 } from "../saved/respond";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const raw = jsonBody(event)?.restoreSavedAt;
  let restore: Date | null = null;
  if (raw !== undefined && raw !== null) {
    restore = parseRfc3339(raw);
    if (!restore) return badBody(scope, "invalid_restore_saved_at");
  }
  return noContentOr(scope, () => savedService.save(customer.id, pathParam(event, "productId"), restore));
});
