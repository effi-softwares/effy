// GET /admin/v1/delivery-pricing — every delivery pricing rule with its bands (032).
// Read access: any active back-office staff.
//
// ⚠ There is no shop-side counterpart to this route, at any verb. FR-008 ("no shop may see, set or
// influence a delivery fee") is enforced by route topology rather than by a check somebody could
// forget to write — a shop token cannot reach this path, because the admin authorizer refuses it
// before any handler runs.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError, toPricingRuleListDTO } from "../delivery/handler-support";
import { listRules } from "../delivery/pricing";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    return json(200, toPricingRuleListDTO(await listRules()), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
