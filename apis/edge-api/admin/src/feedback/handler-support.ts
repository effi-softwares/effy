// Shared handler support for the feedback console slice: the back-office guard and the domain-error →
// problem+json map. Mirrors deliverability/handler-support.ts (no middleware framework, ARCHITECTURE).
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda"

import type { AuthedEvent, RequestScope } from "@effy/edge-shared"
import { forbidden, problem, ProblemType, subject, unavailable } from "@effy/edge-shared"

import { canReplyFeedback, isActiveStaff, staffActor } from "./authz"
import { FeedbackError, type StaffActor } from "./types"

const NOT_FOUND = "https://effyshopping.com/problems/not-found"
const CONFLICT = "https://effyshopping.com/problems/conflict"
const BAD_GATEWAY = "https://effyshopping.com/problems/send-failed"

/**
 * Authenticate (401 without a sub) + authorize from the platform record (403), fail-closed to 503.
 * `read` = any active staff incl. csa; `reply` = admin/manager only. Returns the resolved staff actor
 * (with the display-name snapshot) so a note/reply can attribute itself.
 */
export async function guard(
  event: AuthedEvent,
  scope: RequestScope,
  level: "read" | "reply",
): Promise<{ actor: StaffActor } | { deny: APIGatewayProxyStructuredResultV2 }> {
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
    const ok = level === "read" ? await isActiveStaff(sub) : await canReplyFeedback(sub)
    if (!ok) return { deny: forbidden(scope) }
    return { actor: await staffActor(sub) }
  } catch (err) {
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), sub },
      "feedback authz check failed",
    )
    return { deny: unavailable(scope) }
  }
}

/**
 * Map a domain error to problem+json.
 *
 * ⚠ NO REFUSAL ECHOES A SUBMITTER ADDRESS. 035's "never put a recipient in CloudWatch" does not stop
 * at the service boundary; these messages are about the SUBMISSION, never about an address.
 */
export function mapFeedbackError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (err instanceof FeedbackError) {
    switch (err.kind) {
      case "validation":
        return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope)
      case "not_found":
        return problem(404, NOT_FOUND, "Not found", err.message, scope)
      case "conflict":
        return problem(409, CONFLICT, "Cannot reply", err.message, scope)
      case "send_failed":
        return problem(502, BAD_GATEWAY, "Reply not delivered", err.message, scope)
      case "unavailable":
        return unavailable(scope)
    }
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "feedback op failed")
  return unavailable(scope)
}
