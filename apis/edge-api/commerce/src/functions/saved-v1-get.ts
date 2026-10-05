// GET /commerce/v1/saved — the default list ("Saved"), newest first.
import { json } from "@effy/edge-shared";

import { customerRoute } from "../lib/route";
import { savedService } from "../lib/wiring";
import { DEFAULT_LIST_REF } from "../saved/repository";
import { savedError } from "../saved/respond";

export const handler = customerRoute(async ({ scope, customer }) => {
  try {
    return json(200, await savedService.list(customer.id, DEFAULT_LIST_REF), scope);
  } catch (err) {
    return savedError(scope, err, "list");
  }
});
