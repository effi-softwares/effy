// One registration, not one person: keyed by token, so each device is controlled separately.
// "Not yours" and "no such token" both answer `registered: false`.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import {
  json,
  preamble,
  problem,
  ProblemType,
  readRegistration,
  SHOP_NOTIFICATION_TYPES,
  subject,
} from "@effy/edge-shared";

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
      "a valid shop token is required",
      scope,
    );
  }

  const token = event.queryStringParameters?.token?.trim();
  if (!token) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      "token is required",
      scope,
    );
  }

  const row = await readRegistration(sub, token);

  // Served, not hardcoded in the console: the labels are notification copy.
  return json(
    200,
    {
      registered: row !== null,
      platform: row?.platform ?? null,
      mutedTypes: row?.mutedTypes ?? [],
      availableTypes: SHOP_NOTIFICATION_TYPES,
    },
    scope,
  );
};
