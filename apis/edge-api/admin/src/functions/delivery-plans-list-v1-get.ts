// GET /admin/v1/delivery/plans — list shipping-fee plans (047); exactly one is active. Read: any active staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError, toFeePlanDTO } from "../delivery/handler-support";
import { listPlans } from "../delivery/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    const plans = await listPlans();
    return json(200, { items: plans.map(toFeePlanDTO) }, scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
