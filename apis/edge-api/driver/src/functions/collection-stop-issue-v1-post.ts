import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";
import type { CollectionIssueRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { reportIssue } from "../collection/repository";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/** POST /driver/v1/collection/runs/{runId}/stops/{stopId}/issue (049 US3, FR-015). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  const runId = event.pathParameters?.runId;
  const stopId = event.pathParameters?.stopId;
  if (!runId || !stopId) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "runId and stopId are required", g.scope);
  }
  let body: CollectionIssueRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as CollectionIssueRequest;
  } catch {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "body must be JSON", g.scope);
  }
  if (body.kind !== "missing" && body.kind !== "short") {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "kind must be 'missing' or 'short'", g.scope);
  }
  try {
    const ok = await reportIssue(runId, g.driver.id, stopId, {
      shopFulfillmentId: body.shopFulfillmentId,
      kind: body.kind,
      note: body.note,
    });
    if (!ok) return problem(404, NOT_FOUND, "Not found", "no such stop", g.scope);
    return json(200, { ok: true }, g.scope);
  } catch (err) {
    g.scope.log.error({ err, runId, stopId }, "report issue failed");
    return unavailable(g.scope);
  }
};
