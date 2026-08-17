import { Suspense } from "react"
import type { Metadata } from "next"

import type { CustomerDTO } from "@effy/shared-types"

import { Display } from "@/components/storefront/kit"
import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"

import { FeedbackForm } from "./_components/FeedbackForm"

export const metadata: Metadata = {
  title: "Give us feedback",
  description:
    "Tell Effy what's working, what's not, and what you'd like to see. Bugs, ideas, complaints or compliments — we read every one.",
}

/**
 * `/feedback` (046 US1) — the public feedback page linked from the checkout header (FR-001).
 *
 * ⚠ GUEST-FIRST, and PPR-shaped. The intro is a static shell that prerenders and crawls; the form is a
 * SUSPENSE ISLAND, because it depends on the session (prefill) and the `?from=` param — both uncached,
 * which under `cacheComponents` must not block the whole route (the same static-shell + dynamic-island
 * pattern the storefront header uses). No sign-in wall: a guest sees the same page with an editable,
 * optional email.
 */
export default function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  return (
    <div className="container py-8 sm:py-6">
      <Display size="page">Give us feedback</Display>
      <p className="mt-3 text-sm text-muted-foreground sm:text-base">
        Found a bug, have an idea, or just want to tell us how we&rsquo;re doing? Send it our way — a
        real person reads every message, and we&rsquo;ll reply if it needs one.
      </p>

      <Suspense fallback={<FormFallback />}>
        <FeedbackFormSection searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

/** The dynamic half: resolves the source and (for a signed-in shopper) the prefill, then renders the form. */
async function FeedbackFormSection({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const { from } = await searchParams
  const source = from === "checkout" ? "checkout" : "general"

  const session = await getSession()
  let prefillName: string | null = null
  let prefillEmail: string | null = null

  if (session) {
    try {
      const me = await edgeApi(session).get<CustomerDTO>("/customer/v1/me", perCustomer)
      prefillEmail = me.email
      prefillName = [me.givenName, me.familyName].filter(Boolean).join(" ").trim() || null
    } catch {
      // A barred or unreachable account still gets the guest-shaped form; the authed POST decides.
    }
  }

  return (
    <FeedbackForm
      signedIn={Boolean(session)}
      prefillName={prefillName}
      prefillEmail={prefillEmail}
      source={source}
    />
  )
}

/** A quiet placeholder while the session/prefill resolves — no layout shift beyond the form area. */
function FormFallback() {
  return (
    <div className="mt-8 space-y-5" aria-hidden>
      <div className="h-11 w-full animate-pulse rounded-full bg-muted" />
      <div className="h-40 w-full animate-pulse rounded-2xl bg-muted" />
      <div className="h-11 w-40 animate-pulse rounded-full bg-muted" />
    </div>
  )
}
