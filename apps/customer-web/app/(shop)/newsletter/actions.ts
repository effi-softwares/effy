"use server"

import type { NewsletterSubscribeResult } from "@effy/shared-types"

import { edgeApiPublic, perCustomer } from "@/lib/api/edge"

/**
 * Subscribe to Effy updates (039 US6) — a Server Action, invoked by a plain HTML `<form>`.
 *
 * ⚠ A SERVER ACTION RATHER THAN A CLIENT FETCH, FOR TWO SEPARATE REASONS.
 *
 *   1. **The budget.** `/` sits at 171.8 KB against a 174 KB gate — about 2 KB of headroom. A client
 *      form component plus its state would spend a meaningful slice of that on a control most visitors
 *      never touch. 012 proved the pattern: converting sign-out to a plain form + server handler cost
 *      ZERO client JS and actually *dropped* the guest bundle.
 *   2. ~~**The backend's address is not public.**~~ ⚠ NO LONGER TRUE — left visible rather than
 *      quietly deleted, because it was load-bearing in this decision. The address moved to
 *      `NEXT_PUBLIC_EDGE_API_BASE_URL` (lib/config.ts records why it had to), so the browser now
 *      does know where the edge API lives. Reason 1 still decides this on its own, and the form
 *      keeps working with JS disabled — which a client-side fetch cannot claim either way.
 *
 * ⚠ IT RE-VALIDATES. The form's `type="email" required` is a convenience that catches typos without a
 * round trip; it is not a control. Anything can POST to a Server Action, so the authoritative checks
 * are here and in the service behind it.
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
    // ⚠ The backend returns 202 for ok / 400 for invalid / 503 for error, and this client throws on
    // non-2xx — so the two non-ok outcomes arrive here as exceptions and are separated below.
    await edgeApiPublic().post("/customer/v1/newsletter", { email: email.trim() }, perCustomer)
    return { status: "ok" }
  } catch (err) {
    // ⚠ A 400 means the address itself was refused; anything else means WE failed. The distinction is
    // the difference between "check what you typed" and "try again in a moment" (FR-033), and getting
    // it wrong tells a visitor their address is bad when our service is simply down.
    if (isStatus(err, 400)) return { status: "invalid" }

    // ⚠ Never rethrow. An uncaught Server Action error replaces the page with an error boundary, which
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
