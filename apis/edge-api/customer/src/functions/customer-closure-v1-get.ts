import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble, problem, ProblemType, subject, unavailable } from "@effy/edge-shared"

import { CustomerRecordMissingError, previewClosure } from "../closure/service"

/**
 * GET /customer/v1/closure — everything the customer must see BEFORE any irreversible step (FR-040).
 *
 * Read-only and side-effect free, so the flow may call it as often as it needs: on entry, after the
 * customer resolves a blocker, and again before confirming.
 *
 * ⚠ THIS ROUTE IS DELIBERATELY REACHABLE BY A BARRED CUSTOMER (FR-049).
 *
 * Every other customer route refuses them. Barring protects the platform FROM the customer; it is
 * not a mechanism for holding their data against their wishes, and refusing here would let a
 * platform sanction silently override a data right. The service reads the record directly rather
 * than through `assertActive` precisely so that gate cannot apply.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)

  const sub = subject(event)
  if (!sub) {
    return problem(
      401,
      ProblemType.Unauthenticated,
      "Authentication required",
      "a valid token for the customer audience is required",
      scope,
    )
  }

  try {
    const preview = await previewClosure(sub)
    return json(200, preview, scope)
  } catch (err) {
    if (err instanceof CustomerRecordMissingError) {
      return problem(
        403,
        ProblemType.Forbidden,
        "Not permitted",
        "this account cannot be used",
        scope,
      )
    }
    scope.log.error({ err, sub }, "closure preview failed")
    return unavailable(scope)
  }
}
