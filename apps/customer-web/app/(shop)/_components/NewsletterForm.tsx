"use client"

import { useActionState, useEffect, useState } from "react"

import type { NewsletterSubscribeResult } from "@effy/shared-types"

import { btnClass, input } from "@/components/storefront/kit"

import { subscribeToNewsletter } from "../newsletter/actions"

/**
 * The newsletter section (039 US6).
 *
 * ⚠ A CLIENT COMPONENT, AND THE PLAN SAID IT WOULD NOT BE. Research R3 preferred a fully server-
 * rendered, redirect/param-driven result and named `useActionState` only as a fallback "if a client
 * boundary is unavoidable". It is unavoidable, for one specific reason:
 *
 *   **FR-033 requires the visitor's input to survive a failure.** A redirect cannot carry it back
 *   without putting an email address in the URL — where it lands in server logs, the Referer header
 *   and browser history. That is a worse outcome than a kilobyte of JavaScript: it converts a
 *   transient form value into PII written to several places nobody intended.
 *
 *   The other param-driven option — redirect and silently clear the field — meets the letter of "shows
 *   a retryable error" while failing the requirement it exists for. Somebody whose submission failed
 *   has to retype their address.
 *
 * ⚠ THE COST WAS MEASURED, NOT ASSUMED. `/` was 171.8 KB against a 174 KB gate before this component;
 * `react-dom` already ships `useActionState`, so the marginal weight is this file alone. The bundle
 * gate is the arbiter and it runs on every build — if this ever pushes `/` over, the fallback is the
 * param-driven form WITHOUT input preservation, and that trade goes back to the operator rather than
 * being made silently here.
 *
 * ⚠ The form still works with JavaScript disabled: `action={formAction}` on a real `<form>` posts
 * natively and the Server Action runs. Only the rendered result state needs the client.
 *
 * ⚠ NO DISCOUNT PROMISE (FR-034). The reference storefront's newsletter band offers "20% Off On Your
 * First Purchase". Effy has no such promotion, and a claim like that is a contract with the reader.
 */
export function NewsletterForm() {
  const [state, formAction, pending] = useActionState<NewsletterSubscribeResult | null, FormData>(
    subscribeToNewsletter,
    null,
  )

  /**
   * ⚠ CONTROLLED, AND IT HAS TO BE — this is FR-033's "preserve the visitor's input on failure", and
   * the obvious implementation does not work.
   *
   * React **resets an uncontrolled form automatically once its action completes**. So the first
   * version, which left the field uncontrolled and only cleared it on success, cleared it on EVERY
   * outcome: a visitor whose submission failed was handed an empty box and told to try again. The
   * error message even said "your address is still here" while it demonstrably was not.
   *
   * ⚠ It passed every unit test and was caught by an e2e assertion on the failure branch — because
   * the reset is React's behaviour, not this component's, and nothing in the source says it happens.
   *
   * Holding the value in state takes it out of React's reset path entirely: the field shows what the
   * component says it shows, and only success clears it.
   */
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
      // ⚠ `role="status"` so the outcome is ANNOUNCED, not merely visible. Without it a screen-reader
      // user submits the form and is told nothing at all.
      role="status"
      className={`mt-3 text-sm ${result.status === "ok" ? "text-brand" : "font-medium text-foreground"}`}
    >
      {/* ⚠ Meaning never rests on colour alone (SC-009) — the words carry the whole message, and the
          error tint is redundant reinforcement rather than the signal. */}
      {message}
    </p>
  )
}
