import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, problem, ProblemType, refused, subject, unavailable } from "@effy/edge-shared";

import { canManageDelivery, isActiveStaff } from "./authz";
import { CoverageError } from "./coverage.service";
import { PricingError } from "./pricing.repository";
import { DeliveryError } from "./types";

/** 401, 403 from the staff record, 503 on infra error. `read`: any staff; `mutate`: admin/manager. */
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
    const ok = level === "read" ? await isActiveStaff(sub) : await canManageDelivery(sub);
    if (!ok) return { deny: forbidden(scope) };
  } catch (err) {
    scope.log.error({ err: err instanceof Error ? err.message : String(err), sub }, "delivery authz check failed");
    return { deny: unavailable(scope) };
  }
  return { sub };
}

/** Unknown errors become 503 with the cause logged only. */
export function mapDeliveryError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (err instanceof DeliveryError) {
    const status =
      err.code === "zone_not_found" ? 404 :
      err.code === "postcode_in_zone" || err.code === "hub_not_set" ? 409 :
      err.code === "unknown_postcode" ? 422 : 400;
    const title = status === 404 ? "Not found" : status === 409 ? "Conflict" : status === 422 ? "Unprocessable" : "Validation failed";
    return problem(status, `https://effyshopping.com/problems/${err.code.replace(/_/g, "-")}`, title, err.message, scope);
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "delivery op failed");
  return unavailable(scope);
}

/** `code` becomes the type, with extras beside it; the console words it from the code. */
export function mapCoverageError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (err instanceof CoverageError) return refused(scope, err.status, err.code, err.message, { code: err.code, ...err.extra });
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "coverage op failed");
  return unavailable(scope);
}

/** The console words it from `code`. */
export function mapPricingError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (err instanceof PricingError) return refused(scope, err.status, err.code, err.message, { code: err.code, ...err.extra });
  if (err instanceof SyntaxError) return refused(scope, 400, "invalid_request", "the request body is not JSON", { code: "invalid_request" });
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "pricing op failed");
  return unavailable(scope);
}

