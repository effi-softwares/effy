"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import type {
  CustomerDTO,
  PasswordChallengeResultDTO,
  PasswordWriteDTO,
  UpdateCustomerDTO,
} from "@effy/shared-types"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"
import { clearSessionCookies, renewSession } from "@/lib/session"

/**
 * The account page's writes. A Server Action is a public endpoint, so each re-verifies the session and
 * takes identity from the token, never the body. Privileged operations go through the backend; the
 * browser never talks to Cognito, which keeps `aws-amplify` off the storefront's shared chunk.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

/**
 * Updates the customer's own details, then forces a token refresh: the header greets from the ID
 * token's `given_name`, so without a new token a changed name would not show for up to an hour.
 */
export async function updateProfile(
  input: UpdateCustomerDTO,
): Promise<{ ok: true; customer: CustomerDTO } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Please sign in again." }

  const givenName = input.givenName?.trim() || null
  const familyName = input.familyName?.trim() || null

  // `""` reaches the backend as `""` (it maps empty to null), the only "clear this" signal.
  const phone = input.phone === null || input.phone === undefined ? null : input.phone.trim()

  if ((givenName?.length ?? 0) > 60 || (familyName?.length ?? 0) > 60) {
    return { ok: false, error: "That name is too long." }
  }

  if ((phone?.length ?? 0) > 32) {
    return { ok: false, error: "That phone number is too long." }
  }

  try {
    const customer = await edgeApi(session).patch<CustomerDTO>(
      "/customer/v1/me",
      { givenName, familyName, phone } satisfies UpdateCustomerDTO,
      perCustomer,
    )

    await renewSession()

    revalidatePath("/account")
    revalidatePath("/", "layout")
    return { ok: true, customer }
  } catch {
    return { ok: false, error: "We couldn't save that. Please try again." }
  }
}

/** Asks for the step-up code a first password costs. Grants nothing: the code counts only alongside the new password. */
export async function requestPasswordChallenge(): Promise<Result<{ maskedDestination: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Please sign in again." }

  try {
    const res = await edgeApi(session).post<PasswordChallengeResultDTO>(
      "/customer/v1/password/challenge",
      {},
      perCustomer,
    )
    return { ok: true, maskedDestination: res.maskedDestination }
  } catch (err) {
    return { ok: false, error: messageFor(err, "We couldn't send that code. Please try again.") }
  }
}

/**
 * Sets or changes the password. On success every session is revoked (Cognito's revocation is
 * all-or-nothing), so the cookies are cleared here, in the same request, and the customer signs in
 * again. Redirects; does not return.
 */
export async function writePassword(input: PasswordWriteDTO): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Please sign in again." }

  try {
    await edgeApi(session).put("/customer/v1/password", input, perCustomer)
  } catch (err) {
    return { ok: false, error: messageFor(err, "We couldn't update your password.") }
  }

  // Past this line the password has changed and every session is dead; nothing below may be reported
  // as a failed change. Unlike the app, the web cannot sign back in server-side without the client SDK
  // or a backend that brokers tokens, so the shopper signs in again.
  await clearSessionCookies()
  redirect("/sign-in?reason=password-changed")
}

/** Sign-out is the `POST /sign-out` route handler, reached by a plain form, so the header imports nothing from here. */

/** The backend's problem-detail message, when it is worth showing. */
function messageFor(err: unknown, fallback: string): string {
  const detail = (err as { detail?: unknown })?.detail
  return typeof detail === "string" && detail.length > 0 ? detail : fallback
}
