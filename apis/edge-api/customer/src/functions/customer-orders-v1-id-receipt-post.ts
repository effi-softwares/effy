import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble, problem, ProblemType, unavailable } from "@effy/edge-shared"

import { requireCaller, TokenMismatchError } from "../password/identity"
import { resendReceipt } from "../receipts/service"

/**
 * ⚠ NOT in `ProblemType`, which has no `NotFound` member. Five handlers in `edge-api/admin` already
 * declare this same URI as a local const, so this follows the established convention rather than
 * widening a shared export as a side effect of a receipt slice. (Promoting it into `ProblemType` and
 * collapsing the six copies is a worthwhile tidy — and a different change, with its own blast radius.)
 */
const NOT_FOUND = "https://effyshopping.com/problems/not-found"

/**
 * POST /customer/v1/orders/{id}/receipt — send the receipt for a paid order again (052 US4, FR-027).
 *
 * ⚠ THERE IS NO REQUEST BODY, AND THAT IS THE SECURITY PROPERTY. The receipt goes to the address on
 * the authenticated account, resolved server-side. An `email` field here would make this an open relay
 * for a document carrying a person's name, delivery address and purchase history — anyone with a
 * session could mail someone else's receipt anywhere. The body is ignored entirely.
 *
 * ⚠ IT ENQUEUES, IT DOES NOT SEND. `202 Accepted` means a dispatch row exists; the scheduled worker
 * sends. So a shopper never waits on SES, and a mail outage never surfaces as a failed tap.
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
        // ⚠ Stated plainly, and NOTHING WAS ENQUEUED (FR-028). A refusal a shopper cannot understand
        // is indistinguishable from a bug.
        return problem(
          429,
          ProblemType.RateLimited,
          "Too many requests",
          "we've already sent this receipt a few times recently — check your inbox and spam folder, then try again later",
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
        // ⚠ UNIFORM (FR-029, SC-008). "Not yours" and "does not exist" MUST be indistinguishable —
        // a distinguishable refusal turns this route into an oracle for whether an order id is real.
        return problem(404, NOT_FOUND, "Not found", "no such order", scope)
    }
  } catch (err) {
    scope.log.error({ err, orderId }, "receipt resend failed")
    return unavailable(scope)
  }
}
