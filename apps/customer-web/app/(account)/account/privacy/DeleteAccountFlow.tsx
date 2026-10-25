"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import type { ClosurePreviewDTO } from "@effy/shared-types"

import { OTP_LENGTH, ResponsiveModal, ResponsiveModalContent, ResponsiveModalDescription, ResponsiveModalFooter, ResponsiveModalHeader, ResponsiveModalTitle } from "@effy/design-system/ui"

import { CodeField } from "@/components/storefront/CodeField"
import { Button } from "@/components/ui/button"

import { LoadingArea } from "@/components/Spinner"

import { closeAccount, loadClosurePreview, requestClosureCode } from "./actions"

/** The account-deletion flow. The word is "DELETE" throughout; no deactivate alternative exists. */
export function DeleteAccountFlow() {
  const [preview, setPreview] = useState<ClosurePreviewDTO | null>(null)
  /** A failure of the preview or the send, shown on the page. */
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

  // Still loading. A failed preview is shown as a failure, not as loading.
  if (!preview && error) {
    return (
      <p role="alert" data-testid="closure-error" className="mt-2 text-sm text-destructive">
        {error}
      </p>
    )
  }

  if (!preview) {
    return (
      <LoadingArea
        testId="closure-loading"
        className="min-h-35"
        label="Checking whether your account can be deleted…"
      />
    )
  }

  // Blocked: each blocker names the obligation, links to it and says when it clears.
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
                className="mt-1 inline-flex min-h-12 items-center text-sm underline"
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
      {/* What happens */}
      <div className="space-y-2">
        <p className="text-sm">
          Your account, your saved items, your addresses and your personal details are removed. This
          can&rsquo;t be undone after{" "}
          <strong>{preview.eraseAfterIfRequestedNow.slice(0, 10)}</strong>.
        </p>
        {/* Said before they confirm; absent when there is nothing to lose. */}
        {preview.pointsHeld ? (
          <p className="text-sm">
            You&rsquo;ll also lose your{" "}
            <strong>
              {preview.pointsHeld.toLocaleString("en-AU")} Effy points
              {preview.pointsValueAmount ? ` (worth $${preview.pointsValueAmount})` : ""}
            </strong>
            . Points have no cash value and can&rsquo;t be paid out.
          </p>
        ) : null}
      </div>

      {/* What is kept, and why, from the contract. */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">What we need to keep, and why</h3>
        {/* Each category on its own line, so they can be scanned. */}
        <ul className="space-y-3">
          {preview.retained.map((r) => (
            <li key={r.category}>
              <p className="text-sm font-medium text-foreground">{r.category}</p>
              <p className="mt-1 text-sm text-muted-foreground">{r.reason}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Proof of control: a valid session is not sufficient. */}
      <div className="space-y-3">
        <p className="text-sm">
          To continue, we&rsquo;ll email a code to make sure it&rsquo;s really you.
        </p>
        <Button
          type="button"
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
        // Dismissing discards the attempt: deletion restarts clean rather than resuming.
        onClose={() => setMasked(null)}
      />
    </div>
  )
}

/**
 * The code step in a {@link ResponsiveModal}, so the irreversible commit is a foregrounded act. The field
 * is the platform's `OtpInput` (cells): numeric, one-time-code autofill, LTR, one accessibility node.
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

  // The modal stays mounted, so an abandoned code is cleared.
  useEffect(() => {
    if (open) {
      setCode("")
      setError(null)
    }
  }, [open])

  // Digits only, never truncated: a longer value is shown and blocks submission.
  const tooLong = code.length > OTP_LENGTH
  const complete = code.length === OTP_LENGTH

  function submit(e: React.FormEvent) {
    e.preventDefault()
    // No auto-submit: a mistyped last digit would spend one of three attempts on deleting the account.
    if (!complete || pending) return
    setError(null)
    start(async () => {
      // On success this redirects.
      const res = await closeAccount(code)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        // No dismissal mid-request: the shopper must never be unsure whether the account was deleted.
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
          {/* An explicit margin: the label heads a tall control; the message stays tight to it. */}
          <label htmlFor="closure-code" className="mb-4 block text-sm font-medium">
            Code from your email
          </label>
          <CodeField
            id="closure-code"
            name="code"
            // An over-length value is shown in full as plain text by the field.
            invalid={error !== null}
            aria-describedby={tooLong ? "closure-code-too-long" : undefined}
            autoFocus
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ""))
              setError(null)
            }}
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

        {/* Cancel on the left as a ghost; the destructive confirm on the right. */}
        <ResponsiveModalFooter className="mt-6 flex flex-row justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={pending}
            data-testid="closure-cancel"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="closure-code-form"
            variant="destructive"
            disabled={pending || !complete}
            aria-busy={pending}
            data-testid="closure-confirm"
          >
            {pending ? "Deleting…" : "Delete my account"}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
