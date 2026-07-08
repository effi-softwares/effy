// GET /v1/back-office/ping — the identity-enforcement proving route (spec US3). The
// gateway's back-office JWT authorizer has already AUTHENTICATED the caller (signature,
// issuer, expiry, client_id — a cross-pool token never reaches this code); the handler
// owns AUTHORIZATION: parse the stringified groups claim defensively and deny the
// group-less (research C7/D3/D4).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { groups, hasAnyGroup, subject } from "@effy/edge-shared";
import { forbidden, json, preamble, problem, ProblemType } from "@effy/edge-shared";

const BACK_OFFICE_GROUPS = ["admin", "manager", "csa"] as const;

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);

  const sub = subject(event);
  if (!sub) {
    // Unreachable behind the authorizer; fail closed anyway.
    return problem(401, ProblemType.Unauthenticated, "Authentication required",
      "a valid access token for this audience is required", scope);
  }

  // Absent claim = no groups = deny (a group-less user has NO cognito:groups claim).
  if (!hasAnyGroup(event, BACK_OFFICE_GROUPS)) {
    scope.log.warn({ sub }, "back-office ping: authenticated but group-less");
    return forbidden(scope);
  }

  return json(200, {
    audience: "back-office",
    subject: sub,
    groups: groups(event),
    message: "pong",
  }, scope);
};
