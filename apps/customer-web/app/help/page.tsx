import type { Metadata } from "next"
import { Suspense } from "react"
import type { CustomerDTO } from "@effy/shared-types"

import { FeedbackForm } from "@/app/feedback/_components/FeedbackForm"
import { Card } from "@/components/ui/card"
import { Breadcrumb } from "@/components/ui/misc"
import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"

import { HelpAnswers } from "./HelpAnswers"

export const metadata: Metadata = {
  title: "Help & feedback",
  description:
    "Answers about orders, delivery, payments, refunds, Effy points and your account — or send Effy a message and we'll reply by email.",
  alternates: { canonical: "/help" },
}

/**
 * Help & feedback (reference: Help & info · Help & feedback; FR-030).
 *
 * Answers first, the message form beneath. The form is 046's feedback form, unchanged — the same
 * fields, the same server action, the same reference code on success; `/feedback` now redirects here.
 */
export default function HelpPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  return (
    <div className="container py-6">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Help" }]} />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">How can we help?</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Find a quick answer, or send us a message and we&rsquo;ll reply by email.
      </p>

      <HelpAnswers />

      <Card id="message" className="mt-12 max-w-2xl scroll-mt-44 gap-0 p-6">
        <h2 className="text-lg font-semibold">Send us a message</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Found a bug, have an idea, or need a hand with an order? A real person reads every message.
        </p>
        <Suspense fallback={<FormFallback />}>
          <FeedbackFormSection searchParams={searchParams} />
        </Suspense>
      </Card>
    </div>
  )
}

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
      <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
      <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />
    </div>
  )
}
