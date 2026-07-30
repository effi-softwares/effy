// POST /admin/v1/promotions — create a promotional code (027 FR-050). Mutate access: admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPromoError, toPromoDTO } from "../promotions/handler-support";
import { createPromo } from "../promotions/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  try {
    const body = JSON.parse(event.body ?? "{}");
    return json(201, toPromoDTO(await createPromo(body, g.sub)), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
