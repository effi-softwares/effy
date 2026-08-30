// Shared entry guard for authenticated /driver/v1/* handlers (049).
//
// Resolves the authenticated, provisioned, active driver from the token subject, or returns the
// correct problem response. Every term is uniform and non-disclosing (SC-008): an absent record and
// a non-active record both surface as the same refusal without revealing which — and since 056 that
// also means a suspended driver and an offboarded one are indistinguishable at the login screen,
// which is deliberate: why someone is not working is between them and their employer.

import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { preamble, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";

import { requireDriver } from "./service";
import { DriverAccessError, type DriverRecord } from "./types";

export interface GuardOk {
  ok: true;
  driver: DriverRecord;
  scope: RequestScope;
}
export interface GuardErr {
  ok: false;
  response: APIGatewayProxyStructuredResultV2;
}

/** Resolve the driver for an authenticated handler, or produce the refusal response. */
export async function authenticate(event: AuthedEvent, context: Context): Promise<GuardOk | GuardErr> {
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
    const driver = await requireDriver(sub);
    return { ok: true, driver, scope };
  } catch (err) {
    if (err instanceof DriverAccessError) {
      // Uniform 403 for both not_provisioned and not_active — never disclose which (SC-008).
      return {
        ok: false,
        response: problem(
          403,
          ProblemType.Forbidden,
          "Not an active driver",
          "this account is not an active Effy driver",
          scope,
        ),
      };
    }
    scope.log.error({ err, sub }, "driver guard: record lookup failed");
    return { ok: false, response: unavailable(scope) };
  }
}
