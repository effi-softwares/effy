// DELETE /commerce/v1/lists/{listId}/entries/{productId} — take a product out of one list; un-save
// it if that was its last. Always 204.
import { customerRoute, pathParam } from "../lib/route";
import { savedService } from "../lib/wiring";
import { noContentOr } from "../saved/respond";

export const handler = customerRoute(({ event, scope, customer }) =>
  noContentOr(scope, () => savedService.removeEntry(customer.id, pathParam(event, "listId"), pathParam(event, "productId"))),
);
