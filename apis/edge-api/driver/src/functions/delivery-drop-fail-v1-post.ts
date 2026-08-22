import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";
import type { DropFailRequest, DeliveryFailureReason } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { failDrop } from "../delivery/repository";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";
const REASONS: DeliveryFailureReason[] = ["nobody_home", "wrong_address", "customer_refused", "access_blocked", "other"];

/** POST /driver/v1/delivery/drops/{dropId}/fail (049 US3, FR-028). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  const dropId = event.pathParameters?.dropId;
  if (!dropId) return problem(400, ProblemType.ValidationFailed, "Validation failed", "dropId is required", g.scope);
  let body: DropFailRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as DropFailRequest;
  } catch {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "body must be JSON", g.scope);
  }
  if (!REASONS.includes(body.reason) || !body.changeId) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "a valid reason and changeId are required", g.scope);
  }
  try {
    const ok = await failDrop(dropId, g.driver.id, { reason: body.reason, note: body.note });
    if (!ok) return problem(404, NOT_FOUND, "Not found", "no such drop", g.scope);
    return json(200, { status: "failed" }, g.scope);
  } catch (err) {
    g.scope.log.error({ err, dropId }, "drop fail failed");
    return unavailable(g.scope);
  }
};
