// PATCH /fleet/v1/drivers/{driverId} — edit the profile (056 US1, FR-009/FR-010/FR-012).
// Write = admin/manager.
//
// ⚠ The body is passed through as parsed JSON rather than being rebuilt field by field, because the
// PRESENCE of a key is the signal: absent means "leave alone", null means "clear" (FR-010). Copying
// it into a typed object with `??` defaults would erase exactly that distinction.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { AdminDriverUpdateRequest } from "@effy/shared-types";

import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";
import { updateDriver } from "../drivers/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<AdminDriverUpdateRequest>(event.body);
    return json(
      200,
      await updateDriver(event.pathParameters?.driverId ?? "", body, g.sub, scope),
      scope,
    );
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
