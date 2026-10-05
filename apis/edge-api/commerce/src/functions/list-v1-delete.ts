// DELETE /commerce/v1/lists/{listId} — delete a named list and un-save whatever it alone held.
// Idempotent: a list that does not exist ends in the state the caller asked for.
import { customerRoute, pathParam } from "../lib/route";
import { savedService } from "../lib/wiring";
import { noContentOr } from "../saved/respond";

export const handler = customerRoute(({ event, scope, customer }) =>
  noContentOr(scope, () => savedService.deleteList(customer.id, pathParam(event, "listId"))),
);
