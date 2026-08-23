import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, unavailable } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";
import { listActivity } from "../activity/repository";

/** GET /driver/v1/activity (049 US6, FR-032). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  try {
    return json(200, await listActivity(g.driver.id), g.scope);
  } catch (err) {
    g.scope.log.error({ err }, "activity read failed");
    return unavailable(g.scope);
  }
};
