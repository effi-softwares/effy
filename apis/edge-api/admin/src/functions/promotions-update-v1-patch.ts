// PATCH /admin/v1/promotions/{id} — window, caps and status always; the VALUE only while the code has
// never been redeemed (027 FR-068). A paid order's stored discount was computed from the definition as it
// stood, so rewriting a used code's value would rewrite the meaning of history.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPromoError, toPromoDTO } from "../promotions/handler-support";
import { updatePromo } from "../promotions/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  try {
    const body = JSON.parse(event.body ?? "{}");
    return json(200, toPromoDTO(await updatePromo(event.pathParameters?.id ?? "", body, g.sub)), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
