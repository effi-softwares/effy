import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";
import type { ActivityReadRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { markRead } from "../activity/repository";

/** POST /driver/v1/activity/read (049 US6). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  let body: ActivityReadRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as ActivityReadRequest;
  } catch {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "body must be JSON", g.scope);
  }
  if (!Array.isArray(body.ids)) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "ids (array) is required", g.scope);
  }
  try {
    await markRead(g.driver.id, body.ids);
    return json(200, { ok: true }, g.scope);
  } catch (err) {
    g.scope.log.error({ err }, "activity mark-read failed");
    return unavailable(g.scope);
  }
};
