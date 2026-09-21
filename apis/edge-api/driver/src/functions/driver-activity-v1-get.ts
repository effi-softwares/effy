import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json } from "@effy/edge-shared";
import { authenticate } from "../driver/guard";
import { activity } from "../work/delivery";

/** GET /driver/v1/activity (063) — derived from rounds, never a stored feed. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;
  return json(200, await activity(guard.driver.id), guard.scope);
};
