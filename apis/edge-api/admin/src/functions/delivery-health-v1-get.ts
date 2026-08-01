// GET /admin/v1/delivery-health — the three ways a delivery configuration goes quietly wrong (031 US4).
// Read access: any active staff can see that something is broken.
//
// ⚠ Run against the data as it stood when feature 031 began, `unconfigured` returns 3350 and 3550 —
// Ballarat and Bendigo, told "we deliver here" by the storefront and unquotable at checkout. That is
// this endpoint's acceptance test. If it returns empty on its first run it is not working, it is
// looking in the wrong place.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError } from "../delivery/handler-support";
import { deliveryHealth } from "../delivery/health";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    return json(200, await deliveryHealth(), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
