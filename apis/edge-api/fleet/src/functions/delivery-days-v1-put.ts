// PUT /fleet/v1/delivery-days — save the calendar settings (069 US6, FR-041/042). Mutate = admin/manager.
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
    return json(200, await putDeliveryDays(parseBody<DeliveryDaysInput>(event.body), g.sub, scope), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
