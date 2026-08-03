"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import type { ClosurePreviewDTO } from "@effy/shared-types"

import { Button, Input, Label } from "@effy/design-system/ui"

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
  const [masked, setMasked] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    start(async () => {
      const res = await loadClosurePreview()
      if (res.ok) setPreview(res.preview)
      else setError(res.error)
    })
  }, [])

  if (!preview) {
    return (
      <p className="mt-2 text-sm text-muted-foreground" data-testid="closure-loading">
        {error ?? "Loading…"}
      </p>
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
      {masked === null ? (
        <div className="space-y-3">
          <p className="text-sm">
            To continue, we&rsquo;ll email a code to make sure it&rsquo;s really you.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
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
            Email me a code
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Label htmlFor="closure-code">Code from your email</Label>
          <p className="text-sm text-muted-foreground">We sent a code to {masked}.</p>
          <Input
            id="closure-code"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            data-testid="closure-code"
          />
          {/* The only destructive-styled control in the customer account area. Sign out gave up its
              red so this one could have it (FR-030). */}
          <Button
            type="button"
            variant="destructive"
            disabled={pending || code.trim() === ""}
            data-testid="closure-confirm"
            onClick={() =>
              start(async () => {
                setError(null)
                const res = await closeAccount(code.trim())
                if (!res.ok) setError(res.error)
              })
            }
          >
            Delete my account
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" data-testid="closure-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
