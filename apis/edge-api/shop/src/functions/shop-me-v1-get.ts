import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { groups, json, preamble, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";

import { resolveEmail } from "../staff/email";
import { recordAndLoad } from "../staff/service";

/** Records the operator in the platform's record; admits any shop-pool caller, including role-less and unassigned ones. */
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
      "a valid access token for this audience is required",
      scope,
    );
  }

  try {
    const record = await recordAndLoad(sub, resolveEmail(event), groups(event));
    return json(
      200,
      {
        subject: record.subject,
        email: record.email,
        roles: record.roles,
        status: record.status,
        shop: record.shop,
        lastSeenAt: record.lastSeenAt,
      },
      scope,
    );
  } catch (err) {
    // `subject` only: the email never reaches a log line.
    scope.log.error({ err, sub }, "me: shop staff record upsert failed");
    return unavailable(scope);
  }
};
