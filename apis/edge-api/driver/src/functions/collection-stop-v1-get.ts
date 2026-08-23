import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";
import { getStop } from "../collection/repository";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/** GET /driver/v1/collection/runs/{runId}/stops/{stopId} (049 US1). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  const runId = event.pathParameters?.runId;
  const stopId = event.pathParameters?.stopId;
  if (!runId || !stopId) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "runId and stopId are required", g.scope);
  }
  try {
    const stop = await getStop(runId, g.driver.id, stopId);
    if (!stop) return problem(404, NOT_FOUND, "Not found", "no such stop", g.scope);
    return json(200, stop, g.scope);
  } catch (err) {
    g.scope.log.error({ err, runId, stopId }, "collection stop read failed");
    return unavailable(g.scope);
  }
};
