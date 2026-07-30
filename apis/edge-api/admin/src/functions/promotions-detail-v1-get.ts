// GET /admin/v1/promotions/{id} — definition, usage against caps, and attribution (FR-067/FR-071).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPromoError, toPromoDTO } from "../promotions/handler-support";
import { readPromo } from "../promotions/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    return json(200, toPromoDTO(await readPromo(event.pathParameters?.id ?? "")), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
