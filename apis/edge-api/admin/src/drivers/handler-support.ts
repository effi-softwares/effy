// Shared handler support for the drivers slice (049): the back-office auth guard + DriverAdminError
// → problem mapping. Keeps the thin handlers free of repetition (no middleware framework).
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";

import { canManageDrivers, isActiveStaff } from "./authz";
import { DriverAdminError } from "./service";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/** 401 if no sub; 403 from the platform record; 503 on infra error. `read` = any active staff;
 *  `mutate` = admin/manager. */
export async function guard(
  event: AuthedEvent,
  scope: RequestScope,
  level: "read" | "mutate",
): Promise<{ sub: string } | { deny: APIGatewayProxyStructuredResultV2 }> {
  const sub = subject(event);
  if (!sub) {
    return {
      deny: problem(401, ProblemType.Unauthenticated, "Authentication required",
        "a valid access token for this audience is required", scope),
    };
  }
  try {
    const ok = level === "read" ? await isActiveStaff(sub) : await canManageDrivers(sub);
    if (!ok) return { deny: forbidden(scope) };
  } catch (err) {
    scope.log.error({ err: err instanceof Error ? err.message : String(err), sub }, "driver authz check failed");
    return { deny: unavailable(scope) };
  }
  return { sub };
}

export function mapDriverError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (err instanceof DriverAdminError) {
    if (err.kind === "validation") {
      return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope);
    }
    return problem(404, NOT_FOUND, "Not found", err.message, scope);
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "driver admin op failed");
  return unavailable(scope);
}
