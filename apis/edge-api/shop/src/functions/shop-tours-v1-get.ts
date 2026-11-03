import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";
import { getTourState } from "@effy/edge-shared/tours";

/**
 * The caller's own guided-tour state (106): which shop console tours they have been offered, and whether they want
 * tours offered. Admits any shop-pool caller, like `/shop/v1/me`. The audience is fixed here, never sent by a client.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const sub = subject(event);
  if (!sub) {
    return problem(401, ProblemType.Unauthenticated, "Authentication required", "a valid shop token is required", scope);
  }

  try {
    return json(200, await getTourState("shop", sub), scope);
  } catch (err) {
    scope.log.error({ err, sub }, "tours: read failed");
    return unavailable(scope);
  }
};
