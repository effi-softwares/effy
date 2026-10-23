"use client"

import { useActionState, useEffect, useState } from "react"

import type { NewsletterSubscribeResult } from "@effy/shared-types"

import { btnClass } from "@/components/storefront/actions"
import { input } from "@/components/storefront/fields"

import { subscribeToNewsletter } from "../newsletter/actions"

/**
 * The newsletter section. A client component so a failed submission keeps the visitor's input (a
 * redirect could only carry it back in the URL, writing an email address into logs and history). It
 * still works without JavaScript: `action={formAction}` posts natively. No discount promise: Effy has no
 * such promotion.
 */
export function NewsletterForm() {
  const [state, formAction, pending] = useActionState<NewsletterSubscribeResult | null, FormData>(
    subscribeToNewsletter,
    null,
  )

  /** Controlled: React resets an uncontrolled form once its action completes, which would empty the field on failure too. */
  const [email, setEmail] = useState("")

  useEffect(() => {
    if (state?.status === "ok") setEmail("")
  }, [state])

  return (
    <section aria-labelledby="newsletter-heading" className="pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 id="newsletter-heading" className="text-lg font-semibold">
            Keep up with Effy
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            New products, seasonal picks and the occasional offer. Leave whenever you like.
          </p>
        </div>
        <form action={formAction} className="flex w-full gap-2 lg:max-w-md">
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <input
            id="newsletter-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={state ? "newsletter-status" : "newsletter-terms"}
            aria-invalid={state?.status === "invalid" || undefined}
            className={`${input} min-w-0 flex-1`}
          />
          <button type="submit" disabled={pending} className={btnClass("primary", "md", "h-10 md:h-9")}>
            {pending ? "Signing you up…" : "Subscribe"}
          </button>
        </form>
      </div>
      {state && <NewsletterStatus result={state} />}
      <p id="newsletter-terms" className="mt-3 text-xs text-muted-foreground">
        By subscribing you agree to receive marketing emails and to our{" "}
        <a href="/legal/privacy-policy" className="underline underline-offset-4">
          Privacy Policy
        </a>
        . You can unsubscribe at any time.
      </p>
    </section>
  )
}

export const NEWSLETTER_MESSAGES: Record<NewsletterSubscribeResult["status"], string> = {
  ok: "Thanks — check your inbox and confirm to finish signing up.",
  invalid: "That doesn't look like an email address. Mind checking it?",
  error: "We couldn't sign you up just now. Your address is still here — try again in a moment.",
}

function NewsletterStatus({ result }: { result: NewsletterSubscribeResult }) {
  const message = NEWSLETTER_MESSAGES[result.status]

  return (
    <p
      id="newsletter-status"
      // `role="status"` so the outcome is announced, not merely visible. Without it a screen-reader
      // user submits the form and is told nothing at all.
      role="status"
      className={`mt-3 text-sm ${result.status === "ok" ? "text-brand" : "font-medium text-foreground"}`}
    >
      {/* Meaning never rests on colour alone — the words carry the whole message, and the
          error tint is redundant reinforcement rather than the signal. */}
      {message}
    </p>
  )
}
