import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { PasswordWriteDTO, PasswordWriteResultDTO } from "@effy/shared-types"
import type { AuthedEvent } from "@effy/edge-shared"
import {
  json,
  parseJsonBody,
  preamble,
  problem,
  ProblemType,
  unavailable,
} from "@effy/edge-shared"

import { requireCaller, TokenMismatchError } from "../password/identity"
import {
  CustomerBarredError,
  CustomerNotFoundError,
  PasswordPolicyError,
  WrongModeError,
  writePassword,
} from "../password/service"

/**
 * Set or change: the platform refuses the mode that does not apply, even when submitted directly.
 * The security argument is in `password/service.ts`. Nothing here may log the body (it holds a password).
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
      scope.log.warn({ reason: err.message }, "password write: refused at the identity guard")
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

  const parsed = parseJsonBody<Record<string, unknown>>(event.body)
  if (parsed.errors.length > 0 || !parsed.value) {
    return badRequest(scope, "the request body is not valid JSON")
  }

  const input = readWrite(parsed.value)
  if (!input) {
    return badRequest(scope, "mode must be 'set' (with code) or 'change' (with currentPassword)")
  }

  try {
    const customer = await writePassword(caller.sub, caller.accessToken, input)

    scope.log.info(
      { sub: caller.sub, mode: input.mode },
      "password written; all sessions revoked (FR-024)",
    )

    const result: PasswordWriteResultDTO = { customer, allSessionsRevoked: true }
    return json(200, result, scope)
  } catch (err) {
    return mapError(err, caller.sub, input.mode, scope)
  }
}

/** Rejects anything that is neither mode; never guesses. */
function readWrite(body: Record<string, unknown>): PasswordWriteDTO | null {
  const newPassword = body.newPassword
  if (typeof newPassword !== "string" || newPassword.length === 0) return null

  if (body.mode === "set") {
    const code = body.code
    if (typeof code !== "string" || code.length === 0) return null
    return { mode: "set", code, newPassword }
  }

  if (body.mode === "change") {
    const currentPassword = body.currentPassword
    if (typeof currentPassword !== "string" || currentPassword.length === 0) return null
    return { mode: "change", currentPassword, newPassword }
  }

  return null
}

function badRequest(
  scope: ReturnType<typeof preamble>,
  detail: string,
): APIGatewayProxyStructuredResultV2 {
  return problem(400, ProblemType.ValidationFailed, "Invalid request", detail, scope)
}

function mapError(
  err: unknown,
  sub: string,
  mode: "set" | "change",
  scope: ReturnType<typeof preamble>,
): APIGatewayProxyStructuredResultV2 {
  // Too short, breached, or the breach service is down (fail-closed).
  if (err instanceof PasswordPolicyError) {
    return badRequest(scope, err.message)
  }

  // The wrong flow for this account: refused even though no UI offers it.
  if (err instanceof WrongModeError) {
    return problem(409, ProblemType.ValidationFailed, "Not applicable", err.message, scope)
  }

  if (err instanceof CustomerBarredError || err instanceof CustomerNotFoundError) {
    scope.log.warn({ sub }, "password write: refused - barred or unknown customer")
    return problem(403, ProblemType.Forbidden, "Not permitted", "this account cannot be used", scope)
  }

  const name = (err as { name?: string })?.name

  // The step-up code was wrong, expired or used; the password write is never reached.
  if (name === "CodeMismatchException") {
    scope.log.warn({ sub }, "set-password: refused - bad step-up code")
    return badRequest(scope, "That code isn't right. Check it and try again.")
  }
  if (name === "ExpiredCodeException") {
    scope.log.warn({ sub }, "set-password: refused - expired step-up code")
    return badRequest(scope, "That code has expired. Ask for a new one.")
  }

  // Names the field: "your current password is wrong".
  if (name === "NotAuthorizedException") {
    scope.log.warn({ sub, mode }, "change-password: refused - wrong current password")
    return problem(
      401,
      ProblemType.Unauthenticated,
      "Incorrect password",
      "Your current password isn't right. Check it and try again.",
      scope,
    )
  }

  // Should be unreachable (our check is stricter); firing means the pool policy and PASSWORD_MIN_LENGTH drifted.
  if (name === "InvalidPasswordException") {
    return badRequest(scope, "That password doesn't meet the requirements.")
  }

  if (
    name === "LimitExceededException" ||
    name === "TooManyRequestsException" ||
    name === "TooManyFailedAttemptsException"
  ) {
    return problem(
      429,
      ProblemType.RateLimited,
      "Too many attempts",
      "wait a few minutes and try again",
      scope,
    )
  }

  // Never the body.
  scope.log.error({ err, sub, mode }, "password write failed")
  return unavailable(scope)
}
