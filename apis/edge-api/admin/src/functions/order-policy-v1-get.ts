// GET /admin/v1/order-policy — the minimum spend and the two cart ceilings (027 FR-053).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPromoError, toOrderPolicyDTO } from "../promotions/handler-support";
import { readOrderPolicy } from "../promotions/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    return json(200, toOrderPolicyDTO(await readOrderPolicy()), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
