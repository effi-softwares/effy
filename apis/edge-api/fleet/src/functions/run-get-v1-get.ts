// GET /fleet/v1/runs/{runId} — one run's stops with their timelines (056 US5, FR-040).
// Read = any active back-office staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapFleetError } from "../shared/handler-support";
import { readRun } from "../history/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await readRun(event.pathParameters?.runId ?? ""), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
