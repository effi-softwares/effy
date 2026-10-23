import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { claim, json, preamble, problem, ProblemType, subject, unavailable } from "@effy/edge-shared"

import {
  CustomerBarredError,
  CustomerClosingError,
  getOrCreateCustomer,
} from "../customer/service"

/**
 * Creates the customer record on first appearance and returns the record, not the claims. Requires a
 * real `email` claim (the ID token) and fails closed without one: email is the identity key.
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

  const email = claim(event, "email")
  if (!email) {
    scope.log.error(
      { sub },
      "me: token carries no `email` claim — refusing to fabricate one (see 005's defect)",
    )
    return problem(
      401,
      ProblemType.Unauthenticated,
      "Authentication required",
      "the presented token does not identify the customer",
      scope,
    )
  }

  // Cognito standard attributes; a federated identity may assert neither, so both are nullable.
  const givenName = claim(event, "given_name") ?? null
  const familyName = claim(event, "family_name") ?? null

  // The registration route's hint: seeds `has_password` on create only (see `upsertCustomer`).
  const seedHasPassword = event.queryStringParameters?.route === "password"

  try {
    const customer = await getOrCreateCustomer({
      sub,
      email,
      givenName,
      familyName,
      seedHasPassword,
    })
    return json(200, customer, scope)
  } catch (err) {
    if (err instanceof CustomerBarredError || err instanceof CustomerClosingError) {
      // One uniform refusal: it does not disclose barred or closing.
      scope.log.warn(
        { sub, reason: err instanceof CustomerClosingError ? "closing" : "barred" },
        "me: refused — a valid token was presented for an unusable account",
      )
      return problem(
        403,
        ProblemType.Forbidden,
        "Not permitted",
        "this account cannot be used",
        scope,
      )
    }
    scope.log.error({ err, sub }, "me: customer record upsert failed")
    return unavailable(scope)
  }
}
