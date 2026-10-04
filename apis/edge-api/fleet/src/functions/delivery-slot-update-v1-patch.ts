// PATCH /fleet/v1/delivery-slots/{slotId} — change or switch off a slot (069 US5). Mutate = admin/manager.
// ⚠ There is no DELETE route for a slot, on purpose: a booking references it.
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
    return json(200, await updateSlot(event.pathParameters?.slotId ?? "", parseBody<DeliverySlotPatch>(event.body), g.sub, scope), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
