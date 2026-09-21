import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json } from "@effy/edge-shared";
import { authenticate } from "../driver/guard";
import { history } from "../work/delivery";

/** GET /driver/v1/history (063). ⚠ Thin until Slice D — proof is what makes an entry rich. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;
  return json(200, await history(guard.driver.id), guard.scope);
};
