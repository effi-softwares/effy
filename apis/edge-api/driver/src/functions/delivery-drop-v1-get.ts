import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";
import { getDrop } from "../delivery/repository";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/** GET /driver/v1/delivery/drops/{dropId} (049 US2). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  const dropId = event.pathParameters?.dropId;
  if (!dropId) return problem(400, ProblemType.ValidationFailed, "Validation failed", "dropId is required", g.scope);
  try {
    const drop = await getDrop(dropId, g.driver.id);
    if (!drop) return problem(404, NOT_FOUND, "Not found", "no such drop", g.scope);
    return json(200, drop, g.scope);
  } catch (err) {
    g.scope.log.error({ err, dropId }, "delivery drop read failed");
    return unavailable(g.scope);
  }
};
