import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";
import type { DropStatusRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { advanceStatus } from "../delivery/repository";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";
const VALID = ["out_for_delivery", "en_route", "arrived"] as const;

/** POST /driver/v1/delivery/drops/{dropId}/status (049 US2, FR-019). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  const dropId = event.pathParameters?.dropId;
  if (!dropId) return problem(400, ProblemType.ValidationFailed, "Validation failed", "dropId is required", g.scope);
  let body: DropStatusRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as DropStatusRequest;
  } catch {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "body must be JSON", g.scope);
  }
  if (!VALID.includes(body.to) || !body.changeId) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "to (out_for_delivery|en_route|arrived) and changeId required", g.scope);
  }
  try {
    const status = await advanceStatus(dropId, g.driver.id, body.to, body.changeId);
    if (!status) return problem(404, NOT_FOUND, "Not found", "no such drop", g.scope);
    return json(200, { status }, g.scope);
  } catch (err) {
    g.scope.log.error({ err, dropId }, "drop status advance failed");
    return unavailable(g.scope);
  }
};
