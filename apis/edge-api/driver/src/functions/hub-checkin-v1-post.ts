import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";
import type { HubCheckinRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { checkIn } from "../hubcheckin/repository";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";
const CONFLICT = "https://effyshopping.com/problems/conflict";

/** POST /driver/v1/hub/checkin (049 US1, FR-016) — ends the collection run, returns the split. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  let body: HubCheckinRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as HubCheckinRequest;
  } catch {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "body must be JSON", g.scope);
  }
  if (!body.runId || !body.changeId) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "runId and changeId are required", g.scope);
  }
  try {
    const result = await checkIn(body.runId, g.driver.id, body.changeId);
    if (!result) return problem(404, NOT_FOUND, "Not found", "no such run", g.scope);
    return json(200, result, g.scope);
  } catch (err) {
    if ((err as { code?: string })?.code === "incomplete") {
      return problem(409, CONFLICT, "Run not complete", "collect every package before hub check-in", g.scope);
    }
    g.scope.log.error({ err }, "hub check-in failed");
    return unavailable(g.scope);
  }
};
