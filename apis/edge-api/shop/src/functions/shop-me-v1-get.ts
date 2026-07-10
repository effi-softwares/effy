import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { groups, json, preamble, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";

import { resolveEmail } from "../staff/email";
import { recordAndLoad } from "../staff/service";

/**
 * GET /store/v1/me — the record-backed identity read, and the JIT touchpoint that records the
 * operator in the platform's own system of record.
 *
 * Admits ANY authenticated shop-pool caller, including role-less and store-unassigned operators:
 * its job is to *record* them. Privilege gating lives on /store/v1/manager-ping.
 *
 * A token from another pool never reaches this handler — the gateway's shop JWT authorizer rejects
 * it on issuer and audience (contracts/cross-pool-isolation.contract.md).
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
        store: record.store,
        lastSeenAt: record.lastSeenAt,
      },
      scope,
    );
  } catch (err) {
    // `subject` only — the email is PII and never reaches a log line (Principle VII).
    scope.log.error({ err, sub }, "me: store staff record upsert failed");
    return unavailable(scope);
  }
};
