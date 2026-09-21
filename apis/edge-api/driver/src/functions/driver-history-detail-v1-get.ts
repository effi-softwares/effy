import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import { authenticate } from "../driver/guard";
import { historyDetail } from "../work/delivery";
import { NotFoundError } from "../work/service";

/** GET /driver/v1/history/{kind}/{id} (063). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;
  const kind = event.pathParameters?.kind;
  const id = event.pathParameters?.id;
  if (!kind || !id) return problem(400, "invalid_request", "Missing identifiers", "A kind and id are required.", guard.scope);
  try {
    return json(200, await historyDetail(kind, id, guard.driver.id), guard.scope);
  } catch (err) {
    if (err instanceof NotFoundError) return problem(404, "not_found", "Not available", "That item is not available.", guard.scope);
    throw err;
  }
};
