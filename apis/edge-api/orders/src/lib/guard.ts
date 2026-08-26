// Shared entry guard for authenticated /orders/v1/* handlers (053).
//
// TWO gates, and the split is FR-015 — the platform's standing rule, not this feature's opinion:
//
//   requireStaff  — read, search, detail: ANY active back-office staff, INCLUDING `csa`. Triage is
//                   a CSA's work, and until this feature they could not see a single order they were
//                   being asked about.
//   requireWriter — record a handover, record an arrival: active AND role ∈ {admin, manager}.
//
// ⚠ WHY THE WRITE GATE IS NARROWER, recorded where the next person will read it: with no carrier
// contract, "arrived" is an ASSERTION, not an observation. A staff member is recording that a package
// they never saw reached a customer they never met — and that assertion finishes a financial record
// and sends the customer a message. That places it with 046's outward reply and 037's deliverability
// repair, not with read-and-triage.
//
// Both are decided from the `admin.staff` RECORD, never from the token claim (Principle IV). Every
// refusal is uniform and non-disclosing: it says the action was refused, never which term failed.

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
  /** The acting back-office subject, for attribution on every write (FR-014). */
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
    // ⚠ Fail-CLOSED. A gate that cannot be evaluated is a refusal, never an implicit allow.
    scope.log.error({ err, sub }, "orders guard: staff lookup failed");
    return { ok: false, response: unavailable(scope) };
  }
}

/** Read gate — any active staff, including `csa`. */
export function requireStaff(event: AuthedEvent, context: Context): Promise<GuardOk | GuardErr> {
  return gate(event, context, isActiveStaff);
}

/** Write gate — active AND admin|manager (FR-015). */
export function requireWriter(event: AuthedEvent, context: Context): Promise<GuardOk | GuardErr> {
  return gate(event, context, (sub) => hasStaffRole(sub, OUTWARD_ACTION_ROLES));
}
