import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem, ProblemType, subject } from "@effy/edge-shared";

import { addressErrorResponse } from "../addresses/http";
import { listAddresses } from "../addresses/service";

/** Default first, scoped to the caller's own record. */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);

  const sub = subject(event);
  if (!sub) {
    return problem(
      401,
      ProblemType.Unauthenticated,
      "Authentication required",
      "a valid token for the customer audience is required",
      scope,
    );
  }

  try {
    const addresses = await listAddresses(sub);
    return json(200, addresses, scope);
  } catch (err) {
    return addressErrorResponse(err, scope);
  }
};
