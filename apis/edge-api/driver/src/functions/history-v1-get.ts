import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, unavailable } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";
import { getHistory } from "../history/repository";

/** GET /driver/v1/history (049 US5, FR-033). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  try {
    return json(200, await getHistory(g.driver.id), g.scope);
  } catch (err) {
    g.scope.log.error({ err }, "history read failed");
    return unavailable(g.scope);
  }
};
