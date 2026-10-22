// PUT /commerce/v1/lists/{listId}/entries/{productId} — place a product in a list. Idempotent.
// The optional body carries undo's `restoreAddedAt` and (098) the `variantId` to remember.
import { customerRoute, jsonBody, pathParam } from "../lib/route";
import { savedService } from "../lib/wiring";
import { badBody, noContentOr, parseRfc3339 } from "../saved/respond";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  const raw = body?.restoreAddedAt;
  const variantId = typeof body?.variantId === "string" ? body.variantId : null;
  let restore: Date | null = null;
  if (raw !== undefined && raw !== null) {
    restore = parseRfc3339(raw);
    if (!restore) return badBody(scope, "invalid_restore_added_at");
  }
  return noContentOr(scope, () =>
    savedService.addEntry(customer.id, pathParam(event, "listId"), pathParam(event, "productId"), restore, variantId),
  );
});
