"use server"

import { redirect } from "next/navigation"
import type {
  ClosureChallengeResultDTO,
  ClosurePreviewDTO,
  ClosureResultDTO,
} from "@effy/shared-types"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"
import { clearSessionCookies } from "@/lib/sign-out"

/**
 * Account closure (034 US3).
 *
 * ⚠ A SERVER ACTION IS A PUBLIC ENDPOINT — it compiles to a POST route anyone can craft a request
 * against, so every action re-verifies the session and identity always comes from the token. The
 * backend re-checks everything regardless; this is defence in depth.
 *
 * ⚠ Nothing here offers to deactivate, disable, freeze or pause an account (FR-037/SC-009). The
 * difference between shipping and being rejected is that erasure runs automatically once requested,
 * with no human step — both documented App Review rejections in this area were deactivation flows
 * with a support agent in the loop.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

/** Everything the customer must see before any irreversible step (FR-040). Side-effect free. */
export async function loadClosurePreview(): Promise<Result<{ preview: ClosurePreviewDTO }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Please sign in again." }

  try {
    const preview = await edgeApi(session).get<ClosurePreviewDTO>(
      "/customer/v1/closure",
      perCustomer,
    )
    return { ok: true, preview }
  } catch {
    return { ok: false, error: "We couldn't load this right now. Please try again." }
  }
}

/**
 * Email the step-up code (FR-043).
 *
 * ⚠ Keyed on the account's verified email, never a password — which is exactly why it works for a
 * customer whose only credential is Google. A password prompt here would be an unresolvable dead end
 * for that whole cohort, and therefore "unnecessarily difficult" in Apple's terms.
 */
export async function requestClosureCode(): Promise<Result<{ maskedDestination: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Please sign in again." }

  try {
    const res = await edgeApi(session).post<ClosureChallengeResultDTO>(
      "/customer/v1/closure/challenge",
      {},
      perCustomer,
    )
    return { ok: true, maskedDestination: res.maskedDestination }
  } catch (err) {
    return { ok: false, error: messageFor(err, "We couldn't send that code. Please try again.") }
  }
}

/**
 * Verify the code and close the account.
 *
 * ⚠ REDIRECTS on success, and therefore does not return. Past the point where this succeeds, every
 * session is dead — including this one — so the cookies must be cleared on the server, in the same
 * request that succeeded, or the browser keeps holding a session the platform has already killed.
 */
export async function closeAccount(code: string): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Please sign in again." }

  try {
    await edgeApi(session).post<ClosureResultDTO>(
      "/customer/v1/closure",
      { code },
      perCustomer,
    )
  } catch (err) {
    return { ok: false, error: messageFor(err, "We couldn't delete your account.") }
  }

  await clearSessionCookies()
  redirect("/?reason=account-deleted")
}

/** The backend's problem-detail message, when it gave one worth showing the customer. */
function messageFor(err: unknown, fallback: string): string {
  const detail = (err as { detail?: unknown })?.detail
  return typeof detail === "string" && detail.length > 0 ? detail : fallback
}
