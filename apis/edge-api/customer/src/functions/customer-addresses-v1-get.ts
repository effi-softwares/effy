import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem, ProblemType, subject } from "@effy/edge-shared";

import { addressErrorResponse } from "../addresses/http";
import { listAddresses } from "../addresses/service";

/**
 * GET /customer/v1/addresses — the customer's saved delivery addresses, default first (022 US1).
 *
 * Customer profile management on the cold path (011 FR-028). Scoped to the caller's own record from
 * the token subject; a customer never sees another's addresses (FR-020, SC-005).
 */
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
