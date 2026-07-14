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
 * PUT /customer/v1/password — set OR change (012 FR-016 / FR-017).
 *
 * One route, two modes, because they are two flows for two different people and the platform must
 * refuse the one that does not apply — even if the caller contrives to submit it directly, bypassing
 * a UI that would never have offered it.
 *
 * The security argument lives in `password/service.ts`. This file parses, and translates failures
 * into HTTP.
 *
 * ⚠ NOTHING IN THIS FILE MAY LOG THE BODY. It contains a password, and possibly a step-up code
 * (FR-039 / SC-013). There is no "just while debugging" exception — a password in CloudWatch is a
 * password in CloudWatch.
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

/** Discriminate the union, and REJECT anything that is neither. Never guess a mode. */
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
  // FR-022 — too short, breached, or the breach service is down (fail-closed). All actionable.
  if (err instanceof PasswordPolicyError) {
    return badRequest(scope, err.message)
  }

  // FR-014 — the wrong flow for this account's state. The platform refuses it even though no UI
  // would have offered it, because a Server Action is a public endpoint and so is this.
  if (err instanceof WrongModeError) {
    return problem(409, ProblemType.ValidationFailed, "Not applicable", err.message, scope)
  }

  if (err instanceof CustomerBarredError || err instanceof CustomerNotFoundError) {
    scope.log.warn({ sub }, "password write: refused — barred or unknown customer")
    return problem(403, ProblemType.Forbidden, "Not permitted", "this account cannot be used", scope)
  }

  const name = (err as { name?: string })?.name

  // FR-018 — the step-up code was wrong, expired, or already used. A session that cannot produce a
  // valid code NEVER reaches the password write. This branch IS SC-004.
  if (name === "CodeMismatchException") {
    scope.log.warn({ sub }, "set-password: refused — bad step-up code")
    return badRequest(scope, "That code isn't right. Check it and try again.")
  }
  if (name === "ExpiredCodeException") {
    scope.log.warn({ sub }, "set-password: refused — expired step-up code")
    return badRequest(scope, "That code has expired. Ask for a new one.")
  }

  // FR-016 — the current password was wrong. NAME THE FIELD (FR-027): the customer can act on
  // "your current password is wrong" and cannot act on "something went wrong".
  if (name === "NotAuthorizedException") {
    scope.log.warn({ sub, mode }, "change-password: refused — wrong current password")
    return problem(
      401,
      ProblemType.Unauthenticated,
      "Incorrect password",
      "Your current password isn't right. Check it and try again.",
      scope,
    )
  }

  // Cognito's own policy (length) — should be unreachable, since our own check is stricter and runs
  // first. If it ever fires, the pool policy and PASSWORD_MIN_LENGTH have drifted apart.
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

  // ⚠ `err` here, and the log line below, MUST NOT carry the body. See the file header.
  scope.log.error({ err, sub, mode }, "password write failed")
  return unavailable(scope)
}
