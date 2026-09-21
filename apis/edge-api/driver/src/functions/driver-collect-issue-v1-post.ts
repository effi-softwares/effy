import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { CollectionIssueRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { reportIssue } from "../work/complete";
import { NotFoundError } from "../work/service";

/** POST /driver/v1/collection/runs/{runId}/stops/{stopId}/issue — a package that could not travel. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  const runId = event.pathParameters?.runId;
  const stopId = event.pathParameters?.stopId;
  if (!runId || !stopId) {
    return problem(400, "invalid_request", "Missing identifiers", "A run and stop id are required.", guard.scope);
  }

  let body: CollectionIssueRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as CollectionIssueRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", guard.scope);
  }
  if (!body.changeId) {
    return problem(400, "invalid_request", "Missing changeId", "A changeId is required so a retry is recognised.", guard.scope);
  }

  try {
    await reportIssue(runId, stopId, guard.driver.id, body.shopFulfillmentId, body.note);
    return json(200, { status: "recorded" }, guard.scope);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return problem(404, "not_found", "Not available", "That stop is not available.", guard.scope);
    }
    throw err;
  }
};
