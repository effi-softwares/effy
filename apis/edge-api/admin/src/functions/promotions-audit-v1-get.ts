import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPromoError, toAuditDTO } from "../promotions/handler-support";
import { promotionAudit } from "../promotions/promotion-service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    return json(200, (await promotionAudit(event.pathParameters?.id ?? "")).map(toAuditDTO), scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
