import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import {
  json,
  parseJsonBody,
  preamble,
  problem,
  ProblemType,
  unavailable,
} from "@effy/edge-shared"

import {
  ClosureAlreadyRequestedError,
  ClosureBlockedError,
  CustomerRecordMissingError,
  requestClosure,
} from "../closure/service"
import { requireCaller, TokenMismatchError } from "../password/identity"

/**
 * POST /customer/v1/closure — verify the code and close the account (US3).
 *
 * ⚠ THE ACCOUNT IS CLOSED IMMEDIATELY, AND ERASURE THEN RUNS AUTOMATICALLY (FR-037).
 *
 * No human step stands between this request and erasure, and that is the single most important
 * property of the whole flow: BOTH documented App Review rejections in this area were deactivation
 * flows with a support agent in the loop. This endpoint never offers to deactivate, disable, freeze
 * or pause, and no such state is reachable from it.
 *
 * ⚠ PERMANENT ERASURE IS NOT BUILT YET (FR-041). Until the erasure slice ships, a customer told
 * "permanently deleted after 30 days" will, on day 31, still have a row — so THESE APPS MUST NOT BE
 * SUBMITTED TO EITHER STORE. Tracked in SUBMISSION-BLOCKERS.md.
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
      scope.log.warn({ reason: err.message }, "closure: refused at the identity guard")
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

  const body = parseJsonBody<{ code?: unknown }>(event.body)
  if (body.errors.length > 0 || !body.value) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      body.errors[0]?.message ?? "the request body is not valid JSON",
      scope,
    )
  }

  const code = typeof body.value.code === "string" ? body.value.code.trim() : ""
  if (code === "") {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      "a verification code is required — a valid session alone is not sufficient",
      scope,
    )
  }

  try {
    const result = await requestClosure(caller.sub, caller.accessToken, code)
    scope.log.info(
      { sub: caller.sub, eraseAfter: result.eraseAfter },
      "account closure requested",
    )
    return json(200, result, scope)
  } catch (err) {
    return mapError(err, caller.sub, scope)
  }
}

function mapError(
  err: unknown,
  sub: string,
  scope: ReturnType<typeof preamble>,
): APIGatewayProxyStructuredResultV2 {
  // ⚠ Each failure is DISTINGUISHABLE because each implies a different action for the customer:
  // retry with a new code, go and resolve an order, or nothing at all.
  if (err instanceof ClosureBlockedError) {
    return json(409, { blockers: err.blockers }, scope)
  }
  if (err instanceof ClosureAlreadyRequestedError) {
    return problem(
      409,
      ProblemType.ValidationFailed,
      "Already requested",
      "this account is already scheduled for deletion",
      scope,
    )
  }
  if (err instanceof CustomerRecordMissingError) {
    return problem(403, ProblemType.Forbidden, "Not permitted", "this account cannot be used", scope)
  }

  const name = (err as { name?: string })?.name
  if (name === "CodeMismatchException" || name === "ExpiredCodeException") {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "That code did not work",
      "the code is incorrect or has expired — request a new one",
      scope,
    )
  }
  if (name === "LimitExceededException" || name === "TooManyRequestsException") {
    return problem(
      429,
      ProblemType.RateLimited,
      "Too many attempts",
      "wait a few minutes and try again",
      scope,
    )
  }

  scope.log.error({ err, sub }, "account closure failed")
  return unavailable(scope)
}
