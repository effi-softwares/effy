"use client"

import { useActionState, useEffect, useState } from "react"

import type { NewsletterSubscribeResult } from "@effy/shared-types"

import { Display, btnClass, input, sectionSpacing } from "@/components/storefront/kit"

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
    <section className="border-t bg-muted/40">
      <div className={`container ${sectionSpacing}`}>
        <div className="max-w-xl">
          <Display size="sub">Keep up with Effy</Display>

          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            New products, seasonal picks and the occasional offer. No more than we&rsquo;d want to
            receive ourselves, and you can leave whenever you like.
          </p>

          {/* ⚠ `noValidate` is deliberately ABSENT — the browser's own `type="email" required` check is
              FR-030's "validation before any request", and it is free, translated and accessible. */}
          <form action={formAction} className="mt-6 flex flex-col gap-3 sm:flex-row">
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
              // ⚠ FR-033 — the whole reason this is a client component. See the note on `email`.
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={state ? "newsletter-status" : undefined}
              aria-invalid={state?.status === "invalid" || undefined}
              className={`${input} sm:flex-1`}
            />
            <button type="submit" disabled={pending} className={btnClass("primary", "md")}>
              {pending ? "Signing you up…" : "Subscribe"}
            </button>
          </form>

          {state && <NewsletterStatus result={state} />}

          {/* Consent + privacy (Spam Act / APP 7): marketing is consent-based with an unsubscribe. */}
          <p className="mt-3 text-xs text-muted-foreground">
            By subscribing you agree to receive marketing emails and to our{" "}
            <a href="/legal/privacy-policy" className="underline">
              Privacy Policy
            </a>
            . You can unsubscribe at any time.
          </p>
        </div>
      </div>
    </section>
  )
}

/**
 * ⚠ THREE STATES, NOT FOUR. There is deliberately no "you're already subscribed" — an address already
 * on the list gets the SUCCESS surface, byte-identical, because a distinct response would rebuild in
 * the UI the subscriber-enumeration oracle FR-032 removes from the API. The spec's FR-033 was amended
 * from four states to three to match.
 */
/**
 * Every message this section can show, keyed by the contract's status.
 *
 * ⚠ EXPORTED, AND A RECORD RATHER THAN A TERNARY CHAIN — so a test can assert the actual messages
 * instead of grepping the source for them. The first version of the test did grep, and promptly failed
 * on the *explanatory comment above it*, which is a good demonstration of why source-text assertions
 * are a poor substitute for testing behaviour.
 *
 * ⚠ Typed as `Record<NewsletterSubscribeResult["status"], string>`, so adding a status to the shared
 * contract without giving it wording here is a COMPILE ERROR rather than a blank message in front of a
 * visitor. It is also what makes "there is no `already` state" structural: the contract has no such
 * arm, so this cannot have one either.
 */
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
      className={`mt-3 text-sm ${result.status === "invalid" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {/* ⚠ Meaning never rests on colour alone (SC-009) — the words carry the whole message, and the
          error tint is redundant reinforcement rather than the signal. */}
      {message}
    </p>
  )
}
