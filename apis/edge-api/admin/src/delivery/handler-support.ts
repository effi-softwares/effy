// Shared handler support for the delivery slice (047): the back-office guard, DeliveryError → problem+json,
// and the error mappers. Thin handlers own their own parse/authorize/map flow (no middleware
// framework, per ARCHITECTURE).
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, problem, ProblemType, refused, subject, unavailable } from "@effy/edge-shared";

import { canManageDelivery, isActiveStaff } from "./authz";
import { CoverageError } from "./coverage.service";
import { PricingError } from "./pricing.repository";
import { DeliveryError } from "./types";

/**
 * Authenticate (401) + authorize from the platform record (403), fail-closed to 503 on infra error.
 * `read` = any active staff incl. csa; `mutate` = admin/manager only (FR-046).
 */
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

/** Map a DeliveryError to problem+json; unknown errors become 503 with the cause logged only. */
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

/**
 * Map a CoverageError (076) to problem+json. The `code` becomes the problem's type and any extra
 * (the postcodes that need a distance, a driver count of zero) rides beside it — the console keys
 * its own wording off the code, never off this text.
 */
export function mapCoverageError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (err instanceof CoverageError) return refused(scope, err.status, err.code, err.message, { code: err.code, ...err.extra });
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "coverage op failed");
  return unavailable(scope);
}

/** Map a PricingError (077) to problem+json; the console keys its words off `code`, never this text. */
export function mapPricingError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (err instanceof PricingError) return refused(scope, err.status, err.code, err.message, { code: err.code, ...err.extra });
  if (err instanceof SyntaxError) return refused(scope, 400, "invalid_request", "the request body is not JSON", { code: "invalid_request" });
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "pricing op failed");
  return unavailable(scope);
}
