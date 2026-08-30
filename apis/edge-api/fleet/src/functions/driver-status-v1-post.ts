// POST /fleet/v1/drivers/{driverId}/status — the employment lifecycle (056 US2, FR-015…FR-020).
// Write = admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { AdminDriverStatusRequest, DriverEmploymentStatus } from "@effy/shared-types";

import { validationError } from "../shared/errors";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";
import { setStatus } from "../drivers/service";

const STATUSES: DriverEmploymentStatus[] = ["active", "suspended", "offboarded"];

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<AdminDriverStatusRequest>(event.body);
    if (!STATUSES.includes(body.status)) {
      throw validationError("the status could not be changed", [
        { field: "status", message: `must be one of ${STATUSES.join(", ")}` },
      ]);
    }
    const out = await setStatus(
      event.pathParameters?.driverId ?? "",
      body.status,
      body.reason ?? "",
      body.acknowledgeHeldWork === true,
      g.sub,
      scope,
    );
    return json(200, out.profile, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
