// DELETE /fleet/v1/delivery-days/dates/{day} — reopen a date (069 US6). Mutate = admin/manager.
import { announceSlots } from "../lib/live";
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { preamble } from "@effy/edge-shared";

import { removeNonDeliveryDate } from "../deliverydays/service";
import { denied, guard, mapFleetError } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    await removeNonDeliveryDate(event.pathParameters?.day ?? "", g.sub, scope);
    await announceSlots(); // 071 — committed
    return { statusCode: 204, headers: { "x-request-id": scope.requestId } };
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
