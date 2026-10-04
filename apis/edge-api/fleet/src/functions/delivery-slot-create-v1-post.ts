// POST /fleet/v1/delivery-slots — add a same-day slot (069 US5, FR-036). Mutate = admin/manager.
// ⚠ Live at checkout the moment it is saved.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { DeliverySlotInput } from "@effy/shared-types";

import { createSlot } from "../slots/service";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    return json(201, await createSlot(parseBody<DeliverySlotInput>(event.body), g.sub, scope), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
