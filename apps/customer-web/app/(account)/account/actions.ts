"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { fetchAuthSession } from "aws-amplify/auth/server"
import type {
  CustomerDTO,
  PasswordChallengeResultDTO,
  PasswordWriteDTO,
  UpdateCustomerDTO,
} from "@effy/shared-types"

import { runWithAmplifyServerContext } from "@/lib/amplify-server"
import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"
import { clearSessionCookies } from "@/lib/sign-out"

/**
 * The account page's writes (012).
 *
 * ⚠ A SERVER ACTION IS A PUBLIC ENDPOINT. It compiles to a POST route anyone can craft a request
 * against — the fact that the only *button* which calls it sits behind a guard is irrelevant. Next's
 * own guidance: "Treat Server Actions with the same security considerations as public-facing API
 * endpoints." So every action re-verifies the session, and identity always comes from the token,
 * never from the body (FR-035). The backend re-checks all of it regardless; this is defence in depth.
 *
 * ⚠⚠ NOTE WHAT IS *NOT* IMPORTED HERE: `aws-amplify/auth` — the CLIENT SDK.
 *
 * Every privileged operation on this page (set password · change password · sign out · sign out
 * everywhere) runs THROUGH THE BACKEND from a Server Action. The browser never speaks to Cognito.
 * That is what keeps the auth SDK out of the storefront's shared chunk, which is what keeps the guest
 * bundle budget intact (FR-037 / SC-011) — and `depcruise` fails the build if anyone breaks it.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

/**
 * Update the customer's own details (FR-007 / FR-008 / FR-012).
 *
 * ⚠ THE FORCED TOKEN REFRESH AT THE END IS THE SUBTLE PART, AND IT IS NOT OPTIONAL.
 *
 * The storefront header greets the customer from the ID TOKEN's `given_name` claim — deliberately,
 * because that costs zero backend calls on a cached page (components/header/UserIsland.tsx). So a
 * name changed ONLY in the database would NOT reach the header until the token happened to refresh,
 * up to an hour later. FR-008 and FR-012 would both fail — silently, and in production only.
 *
 * The backend writes the record AND the Cognito attributes. We then force a refresh here, minting a
 * new ID token that carries the new claim. A Server Action CAN write cookies (a React Server
 * Component cannot), which is the only reason this is possible at all (research R11).
 */
export async function updateProfile(
  input: UpdateCustomerDTO,
): Promise<{ ok: true; customer: CustomerDTO } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Please sign in again." }

  const givenName = input.givenName?.trim() || null
  const familyName = input.familyName?.trim() || null

  if ((givenName?.length ?? 0) > 60 || (familyName?.length ?? 0) > 60) {
    return { ok: false, error: "That name is too long." }
  }

  try {
    const customer = await edgeApi(session).patch<CustomerDTO>(
      "/customer/v1/me",
      { givenName, familyName } satisfies UpdateCustomerDTO,
      perCustomer,
    )

    await refreshTokens()

    revalidatePath("/account")
    revalidatePath("/", "layout") // the header greeting lives in the shell
    return { ok: true, customer }
  } catch {
    return { ok: false, error: "We couldn't save that. Please try again." }
  }
}

/**
 * Ask for the step-up code that setting a FIRST password costs (FR-017).
 *
 * ⚠ THIS GRANTS NOTHING. It puts a code in the customer's inbox. No "you may now set a password"
 * state is created anywhere — the code is only worth something when presented back, WITH the new
 * password, in the single request below. There is deliberately nothing here to steal.
 */
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
 * Set or change the password (FR-016 / FR-017).
 *
 * On success EVERY session is revoked — including this one (FR-024). Cognito's revocation is
 * all-or-nothing: there is no "all except this device", and the other devices' refresh tokens cannot
 * be enumerated to revoke them selectively. So we clear the cookies and send the customer to sign in
 * with their new password — which also proves, immediately, that it works.
 *
 * ⚠ REDIRECTS on success, and therefore does not return. Do not "tidy" the redirect up into the
 * caller: the cookies must be cleared on the server, in the same request that succeeded, or the
 * browser keeps holding a session the platform has already killed.
 */
export async function writePassword(input: PasswordWriteDTO): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Please sign in again." }

  try {
    await edgeApi(session).put("/customer/v1/password", input, perCustomer)
  } catch (err) {
    return { ok: false, error: messageFor(err, "We couldn't update your password.") }
  }

  // Past this line the credential HAS changed and every session is dead. Nothing that throws here
  // may be reported to the customer as a failed password change — because it wasn't one.
  await clearSessionCookies()
  redirect("/sign-in?reason=password-changed")
}

/**
 * ⚠ SIGN-OUT IS NOT HERE. It is `POST /sign-out` — a route handler, reached by a plain HTML form.
 *
 * Not a stylistic choice. The header's sign-out button is on the GUEST PATH (the header renders on
 * every page), so anything the header IMPORTS lands there too. A Server Action must be imported, and
 * this module's import graph reaches `lib/dal.ts` → `aws-amplify`. Next erases that at the
 * `"use server"` boundary and would not really ship the SDK — but `depcruise` refuses to reason about
 * that and fired, correctly: its `reachable: true` rule exists BECAUSE 011's first attempt only
 * checked direct imports and missed a real leak that came in through a component.
 *
 * A form posts to a URL — a *string* — so no module edge exists at all, and sign-out costs the guest
 * bundle exactly zero. See app/(auth)/sign-out/route.ts.
 */

/** Force Amplify to mint fresh tokens and write them back to the cookie jar. */
async function refreshTokens(): Promise<void> {
  try {
    await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: (ctx) => fetchAuthSession(ctx, { forceRefresh: true }),
    })
  } catch {
    // Not fatal. The name IS saved — the record is the authority, and the page will show it. Only the
    // header's greeting lags, until the token next refreshes on its own. A stale greeting is a far
    // better outcome than telling the customer their save failed when it did not.
  }
}

/** The backend's problem-detail message, when it gave one worth showing the customer. */
function messageFor(err: unknown, fallback: string): string {
  const detail = (err as { detail?: unknown })?.detail
  return typeof detail === "string" && detail.length > 0 ? detail : fallback
}
