// POST /admin/v1/delivery/plans — create an INACTIVE shipping-fee plan (047). Mutate: admin/manager.
// The a≥b / step-multiple invariants are validated here as field errors before the DB CHECKs.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError, toFeePlanDTO } from "../delivery/handler-support";
import { createPlan } from "../delivery/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  try {
    const body = JSON.parse(event.body ?? "{}");
    return json(201, toFeePlanDTO(await createPlan(body, g.sub)), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
