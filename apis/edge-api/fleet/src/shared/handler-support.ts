// Shared handler support for the fleet service (056): the back-office auth guard and the
// domain-error → problem mapping. Keeps the thin handlers free of repetition (no middleware
// framework — constitution Principle VI, "no DI framework, wiring is explicit and greppable").
//
// ⚠ THE AUTHZ ITSELF IS NOT DEFINED HERE. It comes from @effy/edge-shared's back-office-authz,
// which 053 promoted out of edge-api/admin when a third consumer made it cross-cutting. 049's
// drivers slice carried its OWN copy (`admin/src/drivers/authz.ts`) written before that promotion
// and never reconciled — this service deletes that duplicate rather than moving it (Principle II).
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import {
  forbidden,
  hasStaffRole,
  isActiveStaff,
  OUTWARD_ACTION_ROLES,
  problem,
  ProblemType,
  subject,
  unavailable,
} from "@effy/edge-shared";

import { FleetError } from "./errors";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";

export type GuardLevel = "read" | "mutate";

export type GuardResult = { sub: string } | { deny: APIGatewayProxyStructuredResultV2 };

export function denied(r: GuardResult): r is { deny: APIGatewayProxyStructuredResultV2 } {
  return "deny" in r;
}

/**
 * 401 if there is no subject; 403 from the PLATFORM RECORD (never the claim); 503 on infra error.
 *
 *   read   — any active back-office staff, INCLUDING csa (FR-022). A CSA is exactly who is asked
 *            "why did my delivery fail", and until this feature they could not see the answer.
 *   mutate — active AND role ∈ {admin, manager} (FR-023). A driver record is a credential; changing
 *            one is an action whose blast radius leaves the console.
 *
 * Fail-closed: an authz query that throws returns 503, never an implicit allow.
 */
export async function guard(
  event: AuthedEvent,
  scope: RequestScope,
  level: GuardLevel,
): Promise<GuardResult> {
  const sub = subject(event);
  if (!sub) {
    return {
      deny: problem(
        401,
        ProblemType.Unauthenticated,
        "Authentication required",
        "a valid access token for this audience is required",
        scope,
      ),
    };
  }
  try {
    const ok = level === "read" ? await isActiveStaff(sub) : await hasStaffRole(sub, OUTWARD_ACTION_ROLES);
    if (!ok) return { deny: forbidden(scope) };
  } catch (err) {
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), sub },
      "fleet authz check failed",
    );
    return { deny: unavailable(scope) };
  }
  return { sub };
}

/** Domain error → RFC-7807. Anything unrecognised is 503 and explains itself only in the log. */
export function mapFleetError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (err instanceof FleetError) {
    switch (err.kind) {
      case "validation":
        return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope, err.fields);
      case "not_found":
        return problem(404, NOT_FOUND, "Not found", err.message, scope);
      case "conflict":
        return problem(409, ProblemType.Conflict, "Conflict", err.message, scope, err.fields);
    }
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "fleet operation failed");
  return unavailable(scope);
}

/** Parse a JSON body, refusing malformed input as a validation failure rather than a 500. */
export function parseBody<T>(raw: string | undefined): T {
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new FleetError("validation", "the request body is not valid JSON");
  }
}
