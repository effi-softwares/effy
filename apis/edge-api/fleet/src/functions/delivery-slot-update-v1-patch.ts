// Admin/manager. No DELETE route: bookings reference a slot.
import { announceSlots } from "../lib/live";
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { DeliverySlotPatch } from "@effy/shared-types";

import { updateSlot } from "../slots/service";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const updated = await updateSlot(event.pathParameters?.slotId ?? "", parseBody<DeliverySlotPatch>(event.body), g.sub, scope);
    await announceSlots();
    return json(200, updated, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
