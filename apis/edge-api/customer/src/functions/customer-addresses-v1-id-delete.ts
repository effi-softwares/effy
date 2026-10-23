import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { preamble, problem, ProblemType, subject } from "@effy/edge-shared";

import { addressErrorResponse } from "../addresses/http";
import { deleteAddress } from "../addresses/service";

/**
 * 204, or 409 for the default while other addresses exist (set another default first). Past orders
 * hold their own snapshot.
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

  const id = event.pathParameters?.id;
  if (!id) {
    return problem(400, ProblemType.ValidationFailed, "Invalid request", "an address id is required", scope);
  }

  try {
    await deleteAddress(sub, id);
    return { statusCode: 204, headers: { "x-request-id": scope.requestId }, body: "" };
  } catch (err) {
    return addressErrorResponse(err, scope);
  }
};
