// POST /admin/v1/promotions/{id}/status — enable or disable (027 FR-069). Disabling stops NEW uses
// immediately and never affects orders already paid for (FR-051).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPromoError, toPromoDTO } from "../promotions/handler-support";
import { setStatus } from "../promotions/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  try {
    const body = JSON.parse(event.body ?? "{}");
    return json(200, toPromoDTO(await setStatus(event.pathParameters?.id ?? "", body.status, g.sub)), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
