// For an absent membership, never 404: a retried delete must not look like a failure.
import { customerRoute, pathParam } from "../lib/route";
import { savedService } from "../lib/wiring";
import { noContentOr } from "../saved/respond";

export const handler = customerRoute(({ event, scope, customer }) =>
  noContentOr(scope, () => savedService.remove(customer.id, pathParam(event, "productId"))),
);
