import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";
import { getDetail } from "../history/repository";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/** GET /driver/v1/history/{kind}/{id} (049 US5, FR-034). kind ∈ {run, drop}. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  const kind = event.pathParameters?.kind;
  const id = event.pathParameters?.id;
  if ((kind !== "run" && kind !== "drop") || !id) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "kind must be 'run' or 'drop' and id is required", g.scope);
  }
  try {
    const detail = await getDetail(kind, id, g.driver.id);
    if (!detail) return problem(404, NOT_FOUND, "Not found", "no such record", g.scope);
    return json(200, detail, g.scope);
  } catch (err) {
    g.scope.log.error({ err, kind, id }, "history detail read failed");
    return unavailable(g.scope);
  }
};
