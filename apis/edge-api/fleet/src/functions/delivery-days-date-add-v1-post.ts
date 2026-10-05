// POST /fleet/v1/delivery-days/dates — close one date to standard delivery (069 US6). Mutate = admin/manager.
// ⚠ Answers with how many placed orders already carry the date. It changes none of them (FR-043).
import { announceSlots } from "../lib/live";
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { NonDeliveryDateInput } from "@effy/shared-types";

import { addNonDeliveryDate } from "../deliverydays/service";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const added = await addNonDeliveryDate(parseBody<NonDeliveryDateInput>(event.body), g.sub, scope);
    await announceSlots(); // 071 — committed
    return json(201, added, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
