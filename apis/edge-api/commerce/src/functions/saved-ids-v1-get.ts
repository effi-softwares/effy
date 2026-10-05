// GET /commerce/v1/saved/ids — which products this shopper has saved, and which of those sit in a
// named list. One read fills every heart on a screen.
import { json } from "@effy/edge-shared";

import { customerRoute } from "../lib/route";
import { savedService } from "../lib/wiring";
import { savedError } from "../saved/respond";

export const handler = customerRoute(async ({ scope, customer }) => {
  try {
    return json(200, await savedService.membership(customer.id), scope);
  } catch (err) {
    return savedError(scope, err, "membership");
  }
});
