// GET /shop/v1/notification-preferences?token=<fcmToken> — what THIS registration is set to (059).
//
// ⚠ ONE REGISTRATION, NOT ONE PERSON. FR-025 requires a manager's tablet and a picker's tablet to be
// independently controllable, so the token is the key. Reading by subject alone would show an
// operator their other device's settings and let them change the wrong one.
//
// ⚠ "not yours" AND "no such token" ARE THE SAME ANSWER. Both yield `registered: false`. Making them
// distinguishable would turn this route into an oracle for which FCM tokens exist on the platform.
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

  // ⚠ `availableTypes` IS SERVED, NOT HARDCODED IN THE CONSOLE. These labels are notification copy,
  // and copy has one catalogue — a list in the console would be a second source for the wording the
  // operator reads in the banner itself.
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
