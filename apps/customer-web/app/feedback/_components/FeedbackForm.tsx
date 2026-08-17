"use client"

import { useActionState, useEffect, useRef, useState } from "react"

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_MESSAGE_MAX,
  type SubmitFeedbackResult,
} from "@effy/shared-types"

import { Field, btnClass, input, select } from "@/components/storefront/kit"

import { submitFeedbackAction } from "../actions"

/**
 * The feedback form (046 US1) — the ONE client island on `/feedback`.
 *
 * ⚠ CONTROLLED FIELDS, for the same reason NewsletterForm holds its email in state: React resets an
 * uncontrolled form once its action completes, so an uncontrolled form would wipe everything the
 * shopper typed on a FAILED submit — the outcome whose whole point is that their words survive. Holding
 * the values in state takes them out of React's reset path; only success clears them (by swapping to
 * the confirmation view).
 *
 * ⚠ For a signed-in shopper the email is shown read-only from their profile and NOT posted — the
 * authed route takes the trusted profile email regardless. A guest gets an editable, optional email.
 */
export function FeedbackForm({
  signedIn,
  prefillName,
  prefillEmail,
  source,
}: {
  signedIn: boolean
  prefillName: string | null
  prefillEmail: string | null
  source: string
}) {
  const [state, formAction, pending] = useActionState<SubmitFeedbackResult | null, FormData>(
    submitFeedbackAction,
    null,
  )

  const [category, setCategory] = useState<string>("")
  const [message, setMessage] = useState("")
  const [rating, setRating] = useState("")
  const [name, setName] = useState(prefillName ?? "")
  const [email, setEmail] = useState(prefillEmail ?? "")

  // ⚠ Telemetry through a DYNAMIC import so it never lands in the guest bundle (the 027 pattern), and
  // fired once per outcome. No PII: category/flags/source/outcome only. A no-op until PostHog inits (039).
  const lastReported = useRef<string | null>(null)
  useEffect(() => {
    if (!state) return
    const key = state.status === "ok" ? `ok:${state.referenceCode}` : state.status
    if (lastReported.current === key) return
    lastReported.current = key
    void import("@/lib/telemetry").then(({ capture }) =>
      capture({
        name: "feedback_submitted",
        props: {
          category: category || "unknown",
          hasRating: rating !== "",
          hasEmail: signedIn || email.trim().length > 0,
          source,
          outcome: state.status,
        },
      }),
    )
  }, [state, category, rating, email, signedIn, source])

  if (state?.status === "ok") {
    return <FeedbackConfirmation referenceCode={state.referenceCode} />
  }

  const invalidField = state?.status === "invalid" ? state.field : undefined

  return (
    <form action={formAction} className="mt-8 flex max-w-xl flex-col gap-5">
      {/* Source travels as a hidden field so the server records where the feedback came from (FR-011). */}
      <input type="hidden" name="source" value={source} />

      <Field
        label="What kind of feedback is this?"
        htmlFor="feedback-category"
        error={invalidField === "category" ? "Please choose a category." : null}
      >
        <select
          id="feedback-category"
          name="category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-invalid={invalidField === "category" || undefined}
          className={`${select} w-full`}
        >
          <option value="" disabled>
            Choose one…
          </option>
          {FEEDBACK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {FEEDBACK_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Your message"
        htmlFor="feedback-message"
        error={invalidField === "message" ? "Please tell us a little about it." : null}
        hint={`${message.length}/${FEEDBACK_MESSAGE_MAX}`}
      >
        <textarea
          id="feedback-message"
          name="message"
          required
          rows={6}
          maxLength={FEEDBACK_MESSAGE_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={invalidField === "message" || undefined}
          placeholder="Tell us what's on your mind…"
          className="w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm placeholder:text-muted-foreground outline-none transition-[color,box-shadow] focus-visible:border-ring aria-invalid:border-destructive"
        />
      </Field>

      <Field label="How would you rate your experience? (optional)" htmlFor="feedback-rating">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Rating out of 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors ${
                rating === String(n)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:border-ring"
              }`}
            >
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === String(n)}
                onChange={(e) => setRating(e.target.value)}
                className="sr-only"
              />
              {n}
            </label>
          ))}
          {rating && (
            <button
              type="button"
              onClick={() => setRating("")}
              className="rounded-full px-3 py-2 text-sm text-muted-foreground underline"
            >
              Clear
            </button>
          )}
        </div>
      </Field>

      <Field label={signedIn ? "Your name" : "Your name (optional)"} htmlFor="feedback-name">
        <input
          id="feedback-name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jamie"
          className={input}
        />
      </Field>

      {signedIn ? (
        <Field label="We'll reply to" htmlFor="feedback-email-readonly">
          {/* ⚠ Not posted — the authed route uses the verified profile email. Shown so the shopper
              knows where a reply would land. */}
          <input
            id="feedback-email-readonly"
            type="email"
            value={prefillEmail ?? ""}
            readOnly
            className={`${input} bg-muted/40 text-muted-foreground`}
          />
        </Field>
      ) : (
        <Field
          label="Your email (optional)"
          htmlFor="feedback-email"
          hint="Leave it if you'd like a reply. We won't use it for anything else."
          error={invalidField === "email" ? "That doesn't look like an email address." : null}
        >
          <input
            id="feedback-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={invalidField === "email" || undefined}
            placeholder="you@example.com"
            className={input}
          />
        </Field>
      )}

      {/* `state` is already narrowed to a non-ok result here (the ok branch returned above). */}
      {state && <FeedbackError result={state} />}

      <div>
        <button type="submit" disabled={pending} className={btnClass("primary", "md")}>
          {pending ? "Sending…" : "Send feedback"}
        </button>
      </div>
    </form>
  )
}

/**
 * ⚠ Typed as a Record over the non-ok statuses, so adding a status to the shared result without wording
 * it here is a compile error rather than a blank message. Meaning never rests on colour (the words
 * carry it); the tint is redundant reinforcement.
 */
const FEEDBACK_ERROR_MESSAGES: Record<
  Exclude<SubmitFeedbackResult["status"], "ok">,
  string
> = {
  invalid: "Please check the highlighted fields and try again.",
  rate_limited: "You've sent us a few messages just now — please give it a little while before sending another.",
  error: "We couldn't send that just now. Your message is still here — try again in a moment.",
}

function FeedbackError({ result }: { result: Exclude<SubmitFeedbackResult, { status: "ok" }> }) {
  return (
    <p
      id="feedback-status"
      role="status"
      className={`text-sm ${result.status === "invalid" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {FEEDBACK_ERROR_MESSAGES[result.status]}
    </p>
  )
}

function FeedbackConfirmation({ referenceCode }: { referenceCode: string }) {
  return (
    <div className="mt-8 max-w-xl rounded-2xl border border-dashed px-6 py-12 text-center" role="status">
      <h2 className="text-lg font-semibold">Thanks — we've got it</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        A real person will read what you sent. If it needs a reply, we'll email you back.
      </p>
      <p className="mt-4 text-sm">
        Your reference: <span className="font-mono font-medium">{referenceCode}</span>
      </p>
    </div>
  )
}
