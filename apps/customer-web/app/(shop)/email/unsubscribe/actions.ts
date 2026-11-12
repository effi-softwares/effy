"use server"

import type { EmailUnsubscribeResponse } from "@effy/shared-types"

import { edgeApiPublic, perCustomer } from "@/lib/api/edge"

/**
 * 115 US2: the unsubscribe link in a marketing email. Called by the page FROM THE BROWSER after it has loaded, never in
 * the server render, because mail scanners open links before people do. The token is the credential; the route always
 * answers 200 in one shape, and a failure here reads as "that link didn't work" - never an error page.
 */
export async function unsubscribeFromEmailLink(token: string, messageId: string | null): Promise<EmailUnsubscribeResponse> {
  if (!token) return { ok: false, undoable: false }
  try {
    return await edgeApiPublic().post<EmailUnsubscribeResponse>(
      "/customer/v1/email-unsubscribe",
      { token, messageId },
      perCustomer,
    )
  } catch {
    return { ok: false, undoable: false }
  }
}

/** Undo, within 7 days. */
export async function undoEmailUnsubscribeLink(token: string): Promise<{ ok: boolean }> {
  if (!token) return { ok: false }
  try {
    return await edgeApiPublic().post<{ ok: boolean }>("/customer/v1/email-unsubscribe/undo", { token }, perCustomer)
  } catch {
    return { ok: false }
  }
}
