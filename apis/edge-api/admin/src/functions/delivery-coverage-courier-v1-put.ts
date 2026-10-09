// PUT /admin/v1/delivery/coverage/courier — courier delivery on or off (076 FR-016), the estimate
// customers are shown and the no-window fallback (079). Any of the three. Mutate.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { setCourier } from "../delivery/coverage.service";
import { guard, mapCoverageError } from "../delivery/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    const body = JSON.parse(event.body || "{}");
    return json(200, await setCourier(body, g.sub), scope);
  } catch (err) {
    return mapCoverageError(err, scope);
  }
};
