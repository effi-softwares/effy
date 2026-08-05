import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import {
  json,
  parseJsonBody,
  preamble,
  problem,
  ProblemType,
  subject,
  unavailable,
} from "@effy/edge-shared"

import {
  CustomerBarredError,
  CustomerClosingError,
  CustomerNotFoundError,
  updateCustomerProfile,
} from "../customer/service"
import { updateName } from "../password/cognito"
import { ACCESS_TOKEN_HEADER } from "../password/identity"

const MAX_NAME = 60

/**
 * The phone is bounded but NOT format-checked (034 FR-060).
 *
 * ⚠ Deliberately loose. The value is unverified and non-authoritative — FR-060a bars it from every
 * identity, recovery and authentication path — so a strict national pattern would be a support
 * burden that buys nothing. The bound exists only to stop an unbounded write.
 */
const MAX_PHONE = 32

/**
 * PATCH /customer/v1/me — the customer maintains their own details (FR-026).
 *
 * ⚠ `givenName` and `familyName` ARE THE ONLY WRITABLE FIELDS, and the omissions are deliberate:
 *
 *   • `email`  — changing it is an IDENTITY operation, not a profile edit. A customer who can
 *                rewrite their own email can point it at a victim's address; that is the well-known
 *                Cognito takeover. It is locked in Cognito by requiring verification of the NEW
 *                address before the sign-in identity moves, and it is simply not accepted here.
 *   • `status` — platform-owned (FR-025). Accepting it would let a barred customer un-ban themselves
 *                in a single request.
 *   • `id` / `cognito_sub` — identity keys. Not data.
 *
 * Anything not listed above is IGNORED rather than rejected: the UPDATE names its columns
 * explicitly, so an unexpected field in the body can never reach the database.
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

  const body = parseJsonBody<{ givenName?: unknown; familyName?: unknown; phone?: unknown }>(
    event.body,
  )
  if (body.errors.length > 0 || !body.value) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      body.errors[0]?.message ?? "the request body is not valid JSON",
      scope,
    )
  }

  const given = normalise(body.value.givenName, MAX_NAME)
  const family = normalise(body.value.familyName, MAX_NAME)
  const phone = normalise(body.value.phone, MAX_PHONE)

  if (given.error || family.error) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      `givenName and familyName must be strings of ${MAX_NAME} characters or fewer, or null to clear`,
      scope,
    )
  }

  if (phone.error) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      `phone must be a string of ${MAX_PHONE} characters or fewer, or empty to clear`,
      scope,
    )
  }

  try {
    const customer = await updateCustomerProfile(sub, {
      givenName: given.value,
      familyName: family.value,
      phone: phone.value,
    })
    await syncNameToCognito(event, scope, sub, given.value, family.value)
    return json(200, customer, scope)
  } catch (err) {
    if (err instanceof CustomerBarredError || err instanceof CustomerClosingError) {
      // ⚠ ONE uniform refusal for both. A barred customer and a closing one are different facts, and
      // the service keeps them as distinct errors for the logs — but the WIRE must not disclose
      // which applied, matching the posture every other customer route already holds.
      scope.log.warn(
        { sub, reason: err instanceof CustomerClosingError ? "closing" : "barred" },
        "profile update refused",
      )
      return problem(
        403,
        ProblemType.Forbidden,
        "Not permitted",
        "this account cannot be used",
        scope,
      )
    }
    if (err instanceof CustomerNotFoundError) {
      // A valid token, but no record — they have never completed a GET /me.
      return problem(
        403,
        ProblemType.Forbidden,
        "Not permitted",
        "this account cannot be used",
        scope,
      )
    }
    scope.log.error({ err, sub }, "profile update failed")
    return unavailable(scope)
  }
}

/**
 * Mirror the name onto the Cognito profile so the ID token's claim agrees with the record.
 *
 * ⚠ THIS CALL WAS MISSING, AND ITS ABSENCE WAS A LIVE, SHIPPED BUG (036 R5).
 *
 * `updateName` has existed since 012 and had NO CALL SITES anywhere in the repository. Meanwhile
 * `app/(account)/account/actions.ts` told the reader: "The backend writes the record AND the Cognito
 * attributes. We then force a refresh here, minting a new ID token that carries the new claim."
 * It did not. The refresh minted a genuinely new token carrying the SAME OLD `given_name`, so the
 * storefront header — which greets from that claim, deliberately, because it costs zero backend calls
 * on a cached page — showed the customer's old first name PERMANENTLY, not "for up to an hour".
 *
 * 036 makes this load-bearing rather than merely correct: the name is now collected AFTER the account
 * exists (FR-032), so if this write does not happen there is no earlier moment at which the claim was
 * ever populated. The greeting would read "Account" forever.
 *
 * ── Three rules, each of which is the reason a naive version would be wrong ──────────────────────
 *
 * ⚠ DATABASE FIRST, COGNITO SECOND, AND NEVER FATAL. The record is authoritative and is already
 * committed by the time we get here. Failing the request on a Cognito blip would tell the customer
 * their save failed when it succeeded, and they would try again — writing the same thing twice and
 * still seeing an error. Same posture as `notify.ts`.
 *
 * ⚠ THE ACCESS TOKEN IS OPTIONAL HERE, unlike every other caller of `requireCaller`. Both clients
 * send `X-Effy-Access-Token` today, but making it mandatory would turn an in-flight mobile build into
 * a hard 401 on a profile save. Absent token → skip the mirror, log it, and let the record stand.
 *
 * ⚠ THE PHONE IS NEVER SENT. Writing Cognito's `phone_number` would make an unverified phone an
 * identity attribute, which 034 FR-060a forbids outright — and `customer/phone-isolation.test.ts`
 * scans this service for exactly that mistake.
 *
 * No IAM is involved: `UpdateUserAttributes` is authorised by the CUSTOMER'S OWN access token, which
 * is why `password/cognito.ts` opens by stating that the module needs no permissions at all.
 */
async function syncNameToCognito(
  event: AuthedEvent,
  scope: ReturnType<typeof preamble>,
  sub: string,
  givenName: string | null,
  familyName: string | null,
): Promise<void> {
  const headers = event.headers ?? {}
  const accessToken =
    headers[ACCESS_TOKEN_HEADER] ?? headers[ACCESS_TOKEN_HEADER.toUpperCase()] ?? undefined

  if (!accessToken) {
    scope.log.warn({ sub }, "profile name not mirrored to cognito: no access token presented")
    return
  }

  try {
    await updateName(accessToken, givenName, familyName)
  } catch (err) {
    // Deliberately swallowed. The record is the authority and it is already written.
    scope.log.warn({ err, sub }, "profile name mirror to cognito failed")
  }
}

/**
 * `null` clears the field; a string is trimmed; an empty string means "cleared".
 *
 * ⚠ THE `""`-MEANS-CLEAR RULE IS LOAD-BEARING, NOT COSMETIC. The mobile client serialises with
 * `explicitNulls = false`, so a `null` is dropped from the payload entirely and arrives here as
 * `undefined` — indistinguishable from "field not sent". Every clearable field must therefore send
 * `""`, and every clearable field must be normalised through this one function, or clearing it
 * silently no-ops on mobile while appearing to work on web.
 */
function normalise(raw: unknown, max: number): { value: string | null; error?: true } {
  if (raw === null || raw === undefined) return { value: null }
  if (typeof raw !== "string") return { value: null, error: true }

  const trimmed = raw.trim()
  if (trimmed.length > max) return { value: null, error: true }
  return { value: trimmed === "" ? null : trimmed }
}
