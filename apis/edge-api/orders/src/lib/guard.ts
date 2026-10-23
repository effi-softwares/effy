// requireStaff: any active back-office staff, csa included. requireWriter: admin|manager, because
// recording an arrival is a person's assertion that completes an order and messages a customer.
// Both read `admin.staff`, never the token, and refuse without saying which term failed.

import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import {
  hasStaffRole,
  isActiveStaff,
  OUTWARD_ACTION_ROLES,
  preamble,
  problem,
  ProblemType,
  subject,
  unavailable,
} from "@effy/edge-shared";

export interface GuardOk {
  ok: true;
  /** For attribution on every write. */
  sub: string;
  scope: RequestScope;
}
export interface GuardErr {
  ok: false;
  response: APIGatewayProxyStructuredResultV2;
}

async function gate(
  event: AuthedEvent,
  context: Context,
  allow: (sub: string) => Promise<boolean>,
): Promise<GuardOk | GuardErr> {
  const scope = preamble(event, context);
  const sub = subject(event);
  if (!sub) {
    return {
      ok: false,
      response: problem(
        401,
        ProblemType.Unauthenticated,
        "Authentication required",
        "a valid access token for this audience is required",
        scope,
      ),
    };
  }

  try {
    if (!(await allow(sub))) {
      return {
        ok: false,
        response: problem(
          403,
          ProblemType.Forbidden,
          "Not permitted",
          "this account is not permitted to perform that action",
          scope,
        ),
      };
    }
    return { ok: true, sub, scope };
  } catch (err) {
    scope.log.error({ err, sub }, "orders guard: staff lookup failed");
    return { ok: false, response: unavailable(scope) };
  }
}

export function requireStaff(event: AuthedEvent, context: Context): Promise<GuardOk | GuardErr> {
  return gate(event, context, isActiveStaff);
}

export function requireWriter(event: AuthedEvent, context: Context): Promise<GuardOk | GuardErr> {
  return gate(event, context, (sub) => hasStaffRole(sub, OUTWARD_ACTION_ROLES));
}

/** Admin only: Effy's tax identity is printed on every customer's invoice. */
export function requireAdmin(event: AuthedEvent, context: Context): Promise<GuardOk | GuardErr> {
  return gate(event, context, (sub) => hasStaffRole(sub, ["admin"]));
}
