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
 * Without a subject, 403 from the staff record (never the claim), 503 on an infra error.
 * read: any active staff, csa included (shops ring them about the queue). decide: admin or manager.
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

/** Anything unrecognised is 503 and explained only in the log. */
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

export function parseBody<T>(raw: string | undefined): T {
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ReviewError("validation", "the request body is not valid JSON");
  }
}
