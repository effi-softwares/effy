import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda"

import type { AuthedEvent, RequestScope } from "@effy/edge-shared"
import { forbidden, problem, ProblemType, subject, unavailable } from "@effy/edge-shared"

import { canReplyFeedback, isActiveStaff, staffActor } from "./authz"
import { FeedbackError, type StaffActor } from "./types"

const NOT_FOUND = "https://effyshopping.com/problems/not-found"
const CONFLICT = "https://effyshopping.com/problems/conflict"
const BAD_GATEWAY = "https://effyshopping.com/problems/send-failed"

/** 401, 403 from the staff record, 503 on infra error. `read`: any staff; `reply`: admin/manager. Returns the actor for attribution. */
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

/** No refusal echoes a submitter address. */
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
