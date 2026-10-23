import { customerRoute, pathParam } from "../lib/route";
import { savedService } from "../lib/wiring";
import { noContentOr } from "../saved/respond";

export const handler = customerRoute(({ event, scope, customer }) =>
  noContentOr(scope, () => savedService.removeEntry(customer.id, pathParam(event, "listId"), pathParam(event, "productId"))),
);
