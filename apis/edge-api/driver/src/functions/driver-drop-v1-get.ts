import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import { authenticate } from "../driver/guard";
import { deliveryDrop } from "../work/delivery";
import { NotFoundError } from "../work/service";

/** GET /driver/v1/delivery/drops/{dropId} — one customer stop (063). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;
  const dropId = event.pathParameters?.dropId;
  if (!dropId) return problem(400, "invalid_request", "Missing drop id", "A drop id is required.", guard.scope);
  try {
    return json(200, await deliveryDrop(dropId, guard.driver.id), guard.scope);
  } catch (err) {
    if (err instanceof NotFoundError) return problem(404, "not_found", "Not available", "That drop is not available.", guard.scope);
    throw err;
  }
};
