// DELETE /admin/v1/promotions/{id} — only a code that has NEVER been redeemed (027 FR-070). Disabling is
// the removal path for anything used, so every paid order keeps a code that still explains it.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { preamble } from "@effy/edge-shared";

import { guard, mapPromoError } from "../promotions/handler-support";
import { deletePromo } from "../promotions/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  try {
    await deletePromo(event.pathParameters?.id ?? "", g.sub);
    return { statusCode: 204, headers: { "x-request-id": scope.requestId }, body: "" };
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
