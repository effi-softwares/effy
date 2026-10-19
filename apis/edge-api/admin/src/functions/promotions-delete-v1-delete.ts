// DELETE /admin/v1/promotions/{id} — delete a promotion nobody has used (094; a used one is archived).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { noContent, preamble } from "@effy/edge-shared";

import { guard, mapPromoError } from "../promotions/handler-support";
import { deletePromotion } from "../promotions/promotion-service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    await deletePromotion(event.pathParameters?.id ?? "", g.sub);
    return noContent(scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
