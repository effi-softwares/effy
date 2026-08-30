// POST /fleet/v1/drivers — provision a driver: record + sign-in, together (056 US2, FR-013/FR-014).
// Write = admin/manager. A driver record is a credential; creating one is not a read-scoped action.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { AdminDriverCreateRequest } from "@effy/shared-types";

import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";
import { createDriver } from "../drivers/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<AdminDriverCreateRequest>(event.body);
    return json(201, await createDriver(body, g.sub, scope), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
