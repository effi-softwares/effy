import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";
import { getRun } from "../collection/repository";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/** GET /driver/v1/collection/runs/{runId} (049 US1). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  const runId = event.pathParameters?.runId;
  if (!runId) return problem(400, ProblemType.ValidationFailed, "Validation failed", "runId is required", g.scope);
  try {
    const run = await getRun(runId, g.driver.id);
    if (!run) return problem(404, NOT_FOUND, "Not found", "no such run", g.scope);
    return json(200, run, g.scope);
  } catch (err) {
    g.scope.log.error({ err, runId }, "collection run read failed");
    return unavailable(g.scope);
  }
};
