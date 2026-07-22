import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType, subject } from "@effy/edge-shared";

import { addressErrorResponse, toAddressInput } from "../addresses/http";
import { updateAddress } from "../addresses/service";

/**
 * PATCH /customer/v1/addresses/{id} — edit an address AND/OR set it as default (022 US3, US5).
 *
 * One endpoint covers both: field edits update those fields; `makeDefault: true` promotes this the
 * default, atomically clearing the prior one (idempotent if already default). 404 not-found/not-owned.
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
    const address = await updateAddress(sub, id, toAddressInput(body.value));
    return json(200, address, scope);
  } catch (err) {
    return addressErrorResponse(err, scope);
  }
};
