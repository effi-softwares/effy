"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import type { ClosurePreviewDTO } from "@effy/shared-types"

import {
  Button,
  OTP_LENGTH,
  OtpInput,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@effy/design-system/ui"

import { closeAccount, loadClosurePreview, requestClosureCode } from "./actions"

/**
 * The account-deletion flow (034 US3), web half.
 *
 * ⚠ THE WORD IS "DELETE" THROUGHOUT (FR-037/SC-009). There is no "deactivate" alternative offered
 * anywhere in this component, and no such state exists to reach — which is the specific difference
 * between this and the two flows on record that App Review rejected.
 */
export function DeleteAccountFlow() {
  const [preview, setPreview] = useState<ClosurePreviewDTO | null>(null)
  /** A failure of the preview or the send — belongs on the page, where the control that failed is. */
  const [error, setError] = useState<string | null>(null)
  const [masked, setMasked] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    start(async () => {
      const res = await loadClosurePreview()
      if (res.ok) setPreview(res.preview)
      else setError(res.error)
    })
  }, [])

  // ── Still loading ───────────────────────────────────────────────────────────────────────────
  //
  // ⚠ A FAILED PREVIEW IS NOT A LOADING STATE. This slot used to render `{error ?? "Loading…"}`, so
  // a preview that failed outright sat in the loading region — silent to assistive technology,
  // indistinguishable from a slow network, and with nothing to retry. The two are separated below.
  if (!preview && error) {
    return (
      <p role="alert" data-testid="closure-error" className="mt-2 text-sm text-destructive">
        {error}
      </p>
    )
  }

  if (!preview) {
    return (
      <div
        data-testid="closure-loading"
        role="status"
        className="flex min-h-[140px] items-center justify-center"
      >
        {/* `motion-reduce:animate-none` — the same spinner treatment `AuthKit`'s Submit uses. */}
        <span
          aria-hidden="true"
          className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary motion-reduce:animate-none"
        />
        <span className="sr-only">Checking whether your account can be deleted…</span>
      </div>
    )
  }

  // ── Blocked (FR-042) ────────────────────────────────────────────────────────────────────────
  //
  // ⚠ Each blocker NAMES the obligation, LINKS straight to it, and SAYS WHEN IT CLEARS. A refusal
  // with no way forward is the dead end this requirement forbids — and the clause that catches it is
  // Apple's "apps that make it unnecessarily difficult … will not pass review".
  if (preview.blockers.length > 0) {
    return (
      <div className="mt-2 space-y-4" data-testid="closure-blocked">
        <p className="text-sm">You can&rsquo;t delete your account just yet.</p>
        <ul className="space-y-3">
          {preview.blockers.map((b) => (
            <li key={b.reference} className="border-y py-3">
              <p className="text-sm">
                {b.kind === "order_awaiting_payment"
                  ? `Order ${b.reference} is waiting for payment. Finish or cancel it, then you can delete your account.`
                  : `Order ${b.reference} is on its way. You'll be able to delete your account once it's complete.`}
              </p>
              <Link
                href={b.href}
                className="mt-1 inline-flex min-h-[48px] items-center text-sm underline"
              >
                View order {b.reference}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-6" data-testid="closure-flow">
      {/* What happens (FR-040) */}
      <div className="space-y-2">
        <p className="text-sm">
          Your account, your saved items, your addresses and your personal details are removed. This
          can&rsquo;t be undone after{" "}
          <strong>{preview.eraseAfterIfRequestedNow.slice(0, 10)}</strong>.
        </p>
      </div>

      {/* What is kept, and why (FR-045). Rendered from the contract so the two surfaces cannot
          drift, and so SC-010 can be checked against ONE list rather than two renderings. */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">What we keep, and why</h3>
        <ul className="space-y-1">
          {preview.retained.map((r) => (
            <li key={r.category} className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{r.category}</span> — {r.reason}
            </li>
          ))}
        </ul>
      </div>

      {/* Proof of control (FR-043). ⚠ A valid session is NOT sufficient. */}
      <div className="space-y-3">
        <p className="text-sm">
          To continue, we&rsquo;ll email a code to make sure it&rsquo;s really you.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          aria-busy={pending}
          data-testid="closure-send-code"
          onClick={() =>
            start(async () => {
              setError(null)
              const res = await requestClosureCode()
              if (res.ok) setMasked(res.maskedDestination)
              else setError(res.error)
            })
          }
        >
          {pending ? "Sending…" : "Email me a code"}
        </Button>
      </div>

      {error && (
        <p role="alert" data-testid="closure-error" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <ConfirmCodeModal
        destination={masked}
        // ⚠ Dismissing throws the whole attempt away — `masked` back to null, so the page returns to
        // "Email me a code" rather than to a re-entry point holding a code the shopper may no longer
        // have. Deletion is the one action on this platform where resuming a half-finished attempt
        // is worth less than restarting a clean one.
        onClose={() => setMasked(null)}
      />
    </div>
  )
}

/**
 * The code step, in a {@link ResponsiveModal} — centred Dialog at/above the mobile breakpoint, bottom
 * Drawer below it. Same container as `FieldEditor` and the address form (Principle II).
 *
 * ⚠ IT IS A MODAL BECAUSE THE ACTION IS IRREVERSIBLE. Inline, the confirm button sat in the page
 * among the "what we keep" prose, competing with two policy links for attention. An overlay makes
 * the commit a deliberate, foregrounded act with nothing else on screen to mis-tap.
 *
 * ⚠ THE FIELD IS THE PLATFORM'S OWN `OtpInput` in its `cells` variant — the same control the sign-in
 * code page uses, not a bare text input. That is not cosmetic: it brings `inputMode="numeric"`,
 * `autoComplete="one-time-code"` (OS message autofill), `dir="ltr"`, and ONE accessibility node
 * rather than six.
 */
function ConfirmCodeModal({
  destination,
  onClose,
}: {
  destination: string | null
  onClose: () => void
}) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const open = destination !== null

  // The modal stays mounted across opens, so a code typed and abandoned must not survive into the
  // next attempt.
  useEffect(() => {
    if (open) {
      setCode("")
      setError(null)
    }
  }, [open])

  // ⚠ Digits only, and NEVER truncated (035 FR-004). A longer value is kept, shown in full, and
  // blocks submission — a code that is not six digits did not come from us, and quietly reshaping it
  // into something submittable is the exact defect 035 existed to fix.
  const tooLong = code.length > OTP_LENGTH
  const complete = code.length === OTP_LENGTH

  function submit(e: React.FormEvent) {
    e.preventDefault()
    // ⚠ NO AUTO-SUBMIT. Codes die after three wrong attempts, so a mistyped last digit that submits
    // itself spends an attempt the shopper never chose to spend — and here the attempt being spent
    // is on deleting their account.
    if (!complete || pending) return
    setError(null)
    start(async () => {
      // On success this REDIRECTS — control does not come back here.
      const res = await closeAccount(code)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        // A dismissal mid-request would leave the shopper with no idea whether their account was
        // deleted — the one outcome they must never be uncertain about.
        if (!next && !pending) onClose()
      }}
    >
      <ResponsiveModalContent data-testid="closure-code-dialog">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Confirm it&rsquo;s you</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            We sent a code to {destination}. Enter it to delete your account.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <form id="closure-code-form" onSubmit={submit} noValidate className="px-4 sm:px-0">
          {/* ⚠ Explicit margin rather than `space-y` — the label heads a 56px-tall control and needs
              room to read as one, while the message below must stay tight to the field it is about.
              One gap value cannot be right for both (the same reasoning as the sign-in code step). */}
          <label htmlFor="closure-code" className="mb-4 block text-sm font-medium">
            Code from your email
          </label>
          <OtpInput
            id="closure-code"
            name="code"
            // ⚠ The cells collapse to a plain field when the value is too long. Six positions can
            // only show six characters, so an 8-digit paste rendered as cells would LOOK like a
            // six-digit code — visually reproducing the truncation FR-004 forbids.
            variant={tooLong ? "plain" : "cells"}
            aria-invalid={tooLong || error !== null}
            aria-describedby={tooLong ? "closure-code-too-long" : undefined}
            autoFocus
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ""))
              setError(null)
            }}
            data-testid="closure-code"
          />

          {tooLong && (
            <p id="closure-code-too-long" className="mt-2 text-sm text-destructive">
              That&rsquo;s {code.length} digits. An Effy code is always {OTP_LENGTH}.
            </p>
          )}

          {error && (
            <p role="alert" data-testid="closure-error" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <p className="mt-4 text-sm text-muted-foreground">
            This deletes your account. You can&rsquo;t undo it once the recovery window closes.
          </p>
        </form>

        <ResponsiveModalFooter className="flex flex-col gap-2 sm:flex-col">
          {/* The only destructive-styled control in the customer account area. Sign out gave up its
              red so this one could have it (FR-030). */}
          <Button
            type="submit"
            form="closure-code-form"
            variant="destructive"
            disabled={pending || !complete}
            aria-busy={pending}
            data-testid="closure-confirm"
            className="w-full"
          >
            {pending ? "Deleting…" : "Delete my account"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={pending}
            data-testid="closure-cancel"
            className="w-full"
          >
            Cancel
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
