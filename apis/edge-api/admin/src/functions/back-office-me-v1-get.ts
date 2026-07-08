// GET /v1/back-office/me — the staff-identity read (spec US2 graduated / US4). RECORDS the staff
// member on first authenticated contact (JIT upsert + role reconcile) and returns the platform's
// own record. Admits ANY authenticated back-office caller incl. group-less — its job is to record
// them (contracts/back-office-me).
//
// NOTE on email: API Gateway's JWT authorizer exposes ACCESS-token claims, which carry `username`
// but not `email` (email lives on the ID token, never sent to the backend). We store the
// `username` claim as the identifier; authoritative email enrichment (a Cognito lookup) is a later
// slice — it would need a cognito-idp VPC endpoint the in-VPC Lambda doesn't have today.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "../lib/claims";
import { claim, groups, subject } from "../lib/claims";
import { json, preamble, problem, ProblemType, unavailable } from "../lib/http";
import { recordAndLoad } from "../staff/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);

  const sub = subject(event);
  if (!sub) {
    return problem(401, ProblemType.Unauthenticated, "Authentication required",
      "a valid access token for this audience is required", scope);
  }

  const email = claim(event, "username") ?? sub;

  try {
    const record = await recordAndLoad(sub, email, groups(event));
    return json(200, {
      subject: record.subject,
      email: record.email,
      roles: record.roles,
      status: record.status,
      lastSeenAt: record.lastSeenAt,
    }, scope);
  } catch (err) {
    scope.log.error({ err, sub }, "me: staff record upsert failed");
    return unavailable(scope);
  }
};
