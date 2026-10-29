import type { Metadata } from "next"
import { Suspense } from "react"
import type { CustomerDTO } from "@effy/shared-types"

import { FeedbackForm } from "@/app/feedback/_components/FeedbackForm"
import { Card } from "@/components/ui/card"
import { Breadcrumb } from "@/components/ui/misc"
import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"
import { Bone, Loading } from "@/components/ui/skeletons"

import { HelpAnswers } from "./HelpAnswers"

export const metadata: Metadata = {
  title: "Help & feedback",
  description:
    "Answers about orders, delivery, payments, refunds, Effy points and your account — or send Effy a message and we'll reply by email.",
  alternates: { canonical: "/help" },
}

/** Help & feedback: answers first, the feedback form beneath (`/feedback` redirects here). */
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

/** The form while the session and its prefill resolve: the same fields, labelled, with bones for the controls. */
function FormFallback() {
  return (
    <Loading label="Loading the form">
      <div className="mt-8 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">What kind of feedback is this?</span>
          <Bone kind="control" />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Your message</span>
          <Bone kind="block" className="h-32 rounded-md" />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">How would you rate your experience? (optional)</span>
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Bone key={i} kind="control" className="w-11" />
            ))}
          </div>
        </div>
        <Bone kind="control" className="w-40" />
      </div>
    </Loading>
  )
}
