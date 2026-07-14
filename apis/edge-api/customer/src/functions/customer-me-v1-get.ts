import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { claim, json, preamble, problem, ProblemType, subject, unavailable } from "@effy/edge-shared"

import { CustomerBarredError, getOrCreateCustomer } from "../customer/service"

/**
 * GET /customer/v1/me — the record-backed identity read (FR-023, FR-025, FR-026).
 *
 * Creates the platform's customer record on first appearance, reuses it forever after, and
 * returns THE RECORD — not the claim set. `status` comes from the database.
 *
 * ⚠ ON EMAIL — this slice does NOT inherit 005's defect.
 *
 * `/admin/v1/me` (005) resolves the caller's email as `claim("username") ?? sub`, which can store
 * a raw UUID in the email column when the access token carries no `username`. CLAUDE.md records
 * that as "raised, not fixed"; 007 declined to copy it and so does this.
 *
 * For a CUSTOMER the stakes are higher: email is the IDENTITY KEY that converges the three
 * credential routes onto one person (FR-011). A UUID written into `customer.email` would not be a
 * cosmetic blemish — it would be a corrupt identity, and it would take a unique index with it.
 *
 * So we require a real `email` claim and FAIL CLOSED without one. The storefront sends the ID
 * token (which carries `email`); if this ever starts firing, something is sending the access
 * token instead, and the right fix is there — not a fallback that fabricates an address.
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

  // Cognito STANDARD attributes, set at registration (FR-009a) and carried on the ID token.
  // Nullable: a FEDERATED identity supplies whatever the provider asserts, and may assert neither —
  // the platform must not invent a name it was never given.
  const givenName = claim(event, "given_name") ?? null
  const familyName = claim(event, "family_name") ?? null

  // The registration-route hint (012 FR-013). Seeds `has_password` on the CREATING upsert only, and
  // is ignored on every call thereafter.
  //
  // ⚠ Client-asserted, therefore untrusted — and safe. Cognito cannot be asked whether a user has a
  // password, so the platform must seed the answer from what the sign-up form declares. Lying in
  // either direction grants NO capability the inbox-holder did not already have (the full argument is
  // on `upsertCustomer`). It is a UX hint, never an authorization input: the real gates are the
  // emailed code and the current password, and Cognito enforces both regardless of this value.
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
    if (err instanceof CustomerBarredError) {
      // Uniform refusal. It does NOT disclose that the account is barred, or why — that is an
      // information leak, and the customer cannot act on it anyway.
      scope.log.warn({ sub }, "me: refused — barred customer presented a valid token")
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
