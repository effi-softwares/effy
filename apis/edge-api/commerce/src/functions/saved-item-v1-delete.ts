// DELETE /commerce/v1/saved/{productId} — the heart's un-save.
//
// ⚠ 204 for an absent membership, never 404: a retried delete must not look like a failure.
// Deliberately asymmetric with PUT. Refused 409 `in-named-lists` when the product is in a named list.
import { customerRoute, pathParam } from "../lib/route";
import { savedService } from "../lib/wiring";
import { noContentOr } from "../saved/respond";

export const handler = customerRoute(({ event, scope, customer }) =>
  noContentOr(scope, () => savedService.remove(customer.id, pathParam(event, "productId"))),
);
