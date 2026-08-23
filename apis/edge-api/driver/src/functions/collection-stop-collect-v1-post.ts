import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";
import type { CollectRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { collectStop } from "../collection/repository";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/** POST /driver/v1/collection/runs/{runId}/stops/{stopId}/collect (049 US1, FR-014). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  const runId = event.pathParameters?.runId;
  const stopId = event.pathParameters?.stopId;
  if (!runId || !stopId) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "runId and stopId are required", g.scope);
  }
  let body: CollectRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as CollectRequest;
  } catch {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "body must be JSON", g.scope);
  }
  if (!body.changeId) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "changeId is required", g.scope);
  }
  try {
    const ok = await collectStop(runId, g.driver.id, stopId, body.changeId);
    if (!ok) return problem(404, NOT_FOUND, "Not found", "no such run", g.scope);
    return json(200, { status: "collected" }, g.scope);
  } catch (err) {
    g.scope.log.error({ err, runId, stopId }, "collect stop failed");
    return unavailable(g.scope);
  }
};
