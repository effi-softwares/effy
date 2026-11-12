"use server"

import { redirect } from "next/navigation"
import { isDomainError } from "@effy/api-client"
import {
  CLOSURE_REFUSAL_WORDS,
  type ClosureChallengeResultDTO,
  type ClosurePreviewDTO,
  type ClosureResultDTO,
} from "@effy/shared-types"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"
import { clearSessionCookies } from "@/lib/session"

/**
 * Account closure. Server Actions are public endpoints: each re-verifies the session. Nothing offers to
 * deactivate, freeze or pause; erasure runs automatically once requested.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

/** Everything the customer sees before any irreversible step. Side-effect free. */
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

/** Emails the step-up code, keyed on the verified email (so it works for a Google-only customer). */
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

/** Verifies the code and closes the account. Redirects; every session is dead, so cookies are cleared here. */
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
    // 113: an unpaid checkout's payment is going through - nothing was closed, try again shortly.
    if (isDomainError(err) && err.type?.endsWith("/payment-in-progress")) {
      const orderNumber = err.fields?.find((f) => f.field === "orderNumber")?.message ?? ""
      return { ok: false, error: CLOSURE_REFUSAL_WORDS["payment-in-progress"](orderNumber) }
    }
    return { ok: false, error: messageFor(err, "We couldn't delete your account.") }
  }

  await clearSessionCookies()
  redirect("/?reason=account-deleted")
}

/** The backend's problem-detail message, when it is worth showing. */
function messageFor(err: unknown, fallback: string): string {
  const detail = (err as { detail?: unknown })?.detail
  return typeof detail === "string" && detail.length > 0 ? detail : fallback
}
