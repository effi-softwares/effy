import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType, subject } from "@effy/edge-shared";

import { addressErrorResponse, toAddressInput } from "../addresses/http";
import { createAddress } from "../addresses/service";

/**
 * POST /customer/v1/addresses — add a delivery address (022 US2).
 *
 * The customer's first address becomes the default; `makeDefault: true` atomically clears the prior
 * one (the CTE, in the repository). Required: recipientName, line1, city, postalCode.
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

  const body = parseJsonBody<Record<string, unknown>>(event.body);
  if (body.errors.length > 0 || !body.value) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      body.errors[0]?.message ?? "the request body is not valid JSON",
      scope,
    );
  }

  try {
    const address = await createAddress(sub, toAddressInput(body.value));
    return json(201, address, scope);
  } catch (err) {
    return addressErrorResponse(err, scope);
  }
};
