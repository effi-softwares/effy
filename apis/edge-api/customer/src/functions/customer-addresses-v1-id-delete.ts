import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { preamble, problem, ProblemType, subject } from "@effy/edge-shared";

import { addressErrorResponse } from "../addresses/http";
import { deleteAddress } from "../addresses/service";

/**
 * DELETE /customer/v1/addresses/{id} — delete an address, with the delete-default guard (022 US4).
 *
 * A non-default → 204. The default WHILE other addresses exist → 409 (set another default first,
 * FR-016a) — enforced server-side, so a racing device or a direct call cannot bypass it. The only
 * remaining address → 204 (nothing left to be default). 404 not-found/not-owned. Deleting an
 * address never touches a past order's snapshot (orders hold their own immutable jsonb copy).
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
