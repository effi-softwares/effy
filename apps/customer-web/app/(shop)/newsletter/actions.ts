"use server"

import type { NewsletterSubscribeResult } from "@effy/shared-types"

import { edgeApiPublic, perCustomer } from "@/lib/api/edge"

/**
 * Subscribe to Effy updates: a Server Action behind a plain `<form>`, so it costs the home page no
 * client JS and works without JavaScript. It re-validates: `type="email" required` only catches typos,
 * and anything can POST to a Server Action.
 */
export async function subscribeToNewsletter(
  _prev: NewsletterSubscribeResult | null,
  formData: FormData,
): Promise<NewsletterSubscribeResult> {
  const email = formData.get("email")

  if (typeof email !== "string" || email.trim().length === 0) {
    return { status: "invalid" }
  }

  try {
    // The backend returns 202 for ok / 400 for invalid / 503 for error, and this client throws on
    // non-2xx — so the two non-ok outcomes arrive here as exceptions and are separated below.
    await edgeApiPublic().post("/customer/v1/newsletter", { email: email.trim() }, perCustomer)
    return { status: "ok" }
  } catch (err) {
    // A 400 means the address itself was refused; anything else means WE failed. The distinction is
    // the difference between "check what you typed" and "try again in a moment", and getting
    // it wrong tells a visitor their address is bad when our service is simply down.
    if (isStatus(err, 400)) return { status: "invalid" }

    // Never rethrow. An uncaught Server Action error replaces the page with an error boundary, which
    // would lose everything the visitor typed — FR-033 requires their input to survive.
    return { status: "error" }
  }
}

/** The api-client surfaces the HTTP status on the thrown error; this reads it without assuming a shape. */
function isStatus(err: unknown, status: number): boolean {
  if (typeof err !== "object" || err === null) return false
  const candidate = err as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } }
  return (
    candidate.status === status ||
    candidate.statusCode === status ||
    candidate.response?.status === status
  )
}
