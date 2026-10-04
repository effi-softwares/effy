// Shared handler support for the catalog service (067): the back-office auth guard and the
// domain-error → problem mapping.
//
// ⚠ THE AUTHZ ITSELF IS NOT DEFINED HERE. It comes from @effy/edge-shared's back-office-authz (053
// promoted it), so this service decides who is staff exactly as orders, fleet and admin do.
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

import { ReviewError } from "./errors";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";

export type GuardLevel = "read" | "decide";

export type GuardResult = { sub: string } | { deny: APIGatewayProxyStructuredResultV2 };

export function denied(r: GuardResult): r is { deny: APIGatewayProxyStructuredResultV2 } {
  return "deny" in r;
}

/**
 * 401 if there is no subject; 403 from the PLATFORM RECORD (never the claim); 503 on infra error.
 *
 *   read   — any active back-office staff, INCLUDING csa (FR-011). A CSA is who a shop rings to ask
 *            "why isn't my product live", and must be able to see the queue to answer.
 *   decide — active AND role ∈ {admin, manager}. An approval puts a product on Effy's storefront at
 *            a price Effy set; sending one back stops a shop selling. Neither is customer service.
 *
 * Fail-closed: an authz query that throws returns 503, never an implicit allow.
 */
export async function guard(event: AuthedEvent, scope: RequestScope, level: GuardLevel): Promise<GuardResult> {
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
    scope.log.error({ err: err instanceof Error ? err.message : String(err), sub }, "catalog authz check failed");
    return { deny: unavailable(scope) };
  }
  return { sub };
}

/** Domain error → RFC-7807. Anything unrecognised is 503 and explains itself only in the log. */
export function mapReviewError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (err instanceof ReviewError) {
    switch (err.kind) {
      case "validation":
        return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope, err.fields);
      case "not_found":
        return problem(404, NOT_FOUND, "Not found", err.message, scope);
      case "conflict":
        return problem(409, ProblemType.Conflict, "Conflict", err.message, scope, err.fields);
    }
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "catalog operation failed");
  return unavailable(scope);
}

/** Parse a JSON body, refusing malformed input as a validation failure rather than a 500. */
export function parseBody<T>(raw: string | undefined): T {
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ReviewError("validation", "the request body is not valid JSON");
  }
}
