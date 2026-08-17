"use server"

import {
  FEEDBACK_CATEGORIES,
  type FeedbackSource,
  type SubmitFeedbackResult,
} from "@effy/shared-types"

import { edgeApi, edgeApiPublic, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"

/**
 * Submit feedback (046 US1) — a Server Action invoked by a plain `<form>`.
 *
 * ⚠ IT PICKS THE ROUTE FROM THE SESSION, not from anything the form claims. A signed-in shopper posts
 * to the AUTHENTICATED route (which links their record and takes their trusted email); a guest posts
 * to the PUBLIC route with an unverified email. A client cannot upgrade itself to "signed-in" by
 * setting a field — the only thing that selects the authed route is a real session (research D2).
 *
 * ⚠ IT RE-VALIDATES. The form's native `required` is a convenience; anything can POST here, so the
 * authoritative checks live in the service behind both routes. This just shapes the request and maps
 * the HTTP outcome back to the shared result type.
 */
export async function submitFeedbackAction(
  _prev: SubmitFeedbackResult | null,
  formData: FormData,
): Promise<SubmitFeedbackResult> {
  const category = String(formData.get("category") ?? "")
  const message = String(formData.get("message") ?? "")
  const ratingRaw = String(formData.get("rating") ?? "")
  const source = normaliseSource(String(formData.get("source") ?? "general"))
  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()

  // Cheap client-side-equivalent shaping; the service is the authority.
  if (!FEEDBACK_CATEGORIES.includes(category as never)) return { status: "invalid", field: "category" }
  if (message.trim().length === 0) return { status: "invalid", field: "message" }

  const body: Record<string, unknown> = {
    category,
    message: message.trim(),
    source,
    platform: "web",
  }
  if (ratingRaw) {
    const rating = Number(ratingRaw)
    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) body.rating = rating
  }
  if (name) body.name = name

  const session = await getSession()

  try {
    if (session) {
      // Authed route: the service ignores a body email and uses the verified profile one.
      const res = await edgeApi(session).post<SubmitFeedbackResult>(
        "/customer/v1/feedback",
        body,
        perCustomer,
      )
      return res
    }
    // Guest route: an email is optional and unverified.
    if (email) body.email = email
    const res = await edgeApiPublic().post<SubmitFeedbackResult>(
      "/customer/v1/feedback/public",
      body,
      perCustomer,
    )
    return res
  } catch (err) {
    // ⚠ Never rethrow — an uncaught Server Action error swaps the page for an error boundary and loses
    // everything the shopper typed. Map the status instead.
    if (isStatus(err, 400)) return { status: "invalid" }
    if (isStatus(err, 429)) return { status: "rate_limited" }
    return { status: "error" }
  }
}

function normaliseSource(raw: string): FeedbackSource {
  return raw === "checkout" || raw === "other" ? raw : "general"
}

/** The api-client surfaces the HTTP status on the thrown error; read it without assuming a shape. */
function isStatus(err: unknown, status: number): boolean {
  if (typeof err !== "object" || err === null) return false
  const c = err as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } }
  return c.status === status || c.statusCode === status || c.response?.status === status
}
