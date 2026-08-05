// Shared handler support for the deliverability slice: the back-office guard and the domain-error →
// problem+json map. Mirrors src/shops/handler-support.ts (ARCHITECTURE: no middleware framework).
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda"

import type { AuthedEvent, RequestScope } from "@effy/edge-shared"
import { forbidden, problem, ProblemType, subject, unavailable } from "@effy/edge-shared"

import { canRepairDelivery, isActiveStaff } from "./authz"
import { DeliverabilityError } from "./types"

const NOT_FOUND = "https://effyshopping.com/problems/not-found"

/**
 * Authenticate (401 without a sub) + authorize from the platform record (403), fail-closed to 503.
 * `read` = any active staff including csa; `repair` = admin/manager only.
 */
export async function guard(
  event: AuthedEvent,
  scope: RequestScope,
  level: "read" | "repair",
): Promise<{ sub: string } | { deny: APIGatewayProxyStructuredResultV2 }> {
  const sub = subject(event)
  if (!sub) {
    return {
      deny: problem(
        401,
        ProblemType.Unauthenticated,
        "Authentication required",
        "a valid access token for this audience is required",
        scope,
      ),
    }
  }
  try {
    const ok = level === "read" ? await isActiveStaff(sub) : await canRepairDelivery(sub)
    if (!ok) return { deny: forbidden(scope) }
  } catch (err) {
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), sub },
      "deliverability authz check failed",
    )
    return { deny: unavailable(scope) }
  }
  return { sub }
}

/**
 * Map a domain error to problem+json.
 *
 * ⚠ NO REFUSAL ECHOES THE ADDRESS BACK. Problem responses are logged by intermediaries, and 035's
 * "never put a recipient in CloudWatch" rule does not stop at the service boundary. The messages
 * below are deliberately about the RECORD, never about the address.
 */
export function mapDeliverabilityError(
  err: unknown,
  scope: RequestScope,
): APIGatewayProxyStructuredResultV2 {
  if (err instanceof DeliverabilityError) {
    switch (err.kind) {
      case "validation":
        return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope)
      case "not_found":
        return problem(404, NOT_FOUND, "Not found", err.message, scope)
      case "unavailable":
        return unavailable(scope)
    }
  }
  scope.log.error(
    { err: err instanceof Error ? err.message : String(err) },
    "deliverability op failed",
  )
  return unavailable(scope)
}
