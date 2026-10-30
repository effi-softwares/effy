import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble, problem, ProblemType, unavailable } from "@effy/edge-shared"

import { requireCaller, TokenMismatchError } from "../password/identity"
import { resendReceipt } from "../receipts/service"

/** Not in `ProblemType`; declared locally like the admin handlers. */
const NOT_FOUND = "https://effyshopping.com/problems/not-found"

/**
 * Re-sends a paid order's receipt to the account's own address; there is no body, or this would be an
 * open relay for someone's receipt. It enqueues and the worker sends.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)

  let caller
  try {
    caller = requireCaller(event)
  } catch (err) {
    if (err instanceof TokenMismatchError) {
      scope.log.warn({ reason: err.message }, "receipt resend: refused at the identity guard")
      return problem(
        401,
        ProblemType.Unauthenticated,
        "Authentication required",
        "a valid customer session is required",
        scope,
      )
    }
    throw err
  }

  const orderId = event.pathParameters?.id
  if (!orderId) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      "an order id is required",
      scope,
    )
  }

  try {
    const result = await resendReceipt(orderId, caller.sub)

    switch (result.status) {
      case "queued":
        return json(202, { status: "queued" }, scope)

      case "rate_limited":
        // Said plainly; nothing was enqueued.
        return problem(
          429,
          ProblemType.RateLimited,
          "Too many requests",
          "we've already sent this receipt a few times recently - check your inbox and spam folder, then try again later",
          scope,
        )

      case "not_paid":
        return problem(
          409,
          ProblemType.ValidationFailed,
          "No receipt yet",
          "this order has not been paid, so there is no receipt to send",
          scope,
        )

      case "no_recipient":
        return problem(
          409,
          ProblemType.ValidationFailed,
          "No email address",
          "there is no email address on this account to send a receipt to",
          scope,
        )

      case "not_found":
      default:
        // "Not yours" and "does not exist" are indistinguishable.
        return problem(404, NOT_FOUND, "Not found", "no such order", scope)
    }
  } catch (err) {
    scope.log.error({ err, orderId }, "receipt resend failed")
    return unavailable(scope)
  }
}
