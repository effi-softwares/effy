import { json } from "@effy/edge-shared";

import { customerRoute, pathParam } from "../lib/route";
import { savedService } from "../lib/wiring";
import { savedError } from "../saved/respond";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  try {
    return json(200, await savedService.list(customer.id, pathParam(event, "listId")), scope);
  } catch (err) {
    return savedError(scope, err, "list");
  }
});
