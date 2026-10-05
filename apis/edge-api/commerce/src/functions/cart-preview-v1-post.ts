// POST /commerce/v1/cart/preview — PUBLIC. Re-price a guest's device cart with full notices and
// write nothing. Takes no identity and persists nothing, so there is nothing to leak.
import { validationFailed } from "@effy/edge-shared";

import { respond } from "../cart/respond";
import { jsonBody, publicRoute } from "../lib/route";
import { cartService } from "../lib/wiring";
import { lineInputs } from "./cart-merge-v1-post";

export const handler = publicRoute(async ({ event, scope }) => {
  const body = jsonBody(event);
  const lines = lineInputs(body?.lines);
  if (!body || lines === null) return validationFailed(scope, "lines are required");
  return respond(scope, () => cartService.preview(lines));
});
