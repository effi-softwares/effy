// GET /fleet/v1/drivers/{driverId} — the profile of record (056 US1, FR-006).
// Read = any active back-office staff, including csa.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapFleetError } from "../shared/handler-support";
import { getDriver } from "../drivers/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await getDriver(event.pathParameters?.driverId ?? "", scope), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
