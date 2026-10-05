// PUT /commerce/v1/lists/{listId}/entries/{productId} — place a product in a list. Idempotent.
// The optional body carries only undo's `restoreAddedAt`.
import { customerRoute, jsonBody, pathParam } from "../lib/route";
import { savedService } from "../lib/wiring";
import { badBody, noContentOr, parseRfc3339 } from "../saved/respond";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const raw = jsonBody(event)?.restoreAddedAt;
  let restore: Date | null = null;
  if (raw !== undefined && raw !== null) {
    restore = parseRfc3339(raw);
    if (!restore) return badBody(scope, "invalid_restore_added_at");
  }
  return noContentOr(scope, () =>
    savedService.addEntry(customer.id, pathParam(event, "listId"), pathParam(event, "productId"), restore),
  );
});
