// Admin/manager.
import { announceSlots } from "../lib/live";
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { DeliveryDaysInput } from "@effy/shared-types";

import { putDeliveryDays } from "../deliverydays/service";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const days = await putDeliveryDays(parseBody<DeliveryDaysInput>(event.body), g.sub, scope);
    await announceSlots();
    return json(200, days, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
