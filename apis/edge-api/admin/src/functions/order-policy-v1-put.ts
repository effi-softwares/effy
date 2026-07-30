// PUT /admin/v1/order-policy — set the minimum spend and the ceilings (027 FR-053). Idempotent: there is
// exactly one policy row, enforced by the schema.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPromoError, toOrderPolicyDTO } from "../promotions/handler-support";
import { writeOrderPolicy } from "../promotions/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  try {
    const body = JSON.parse(event.body ?? "{}");
    return json(200, toOrderPolicyDTO(await writeOrderPolicy(body, g.sub)), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
