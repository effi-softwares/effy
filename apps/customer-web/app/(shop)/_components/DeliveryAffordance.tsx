"use client"

import { MapPin, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { coreApiBaseUrl } from "@/lib/config"
import {
  clearDeliveryContext,
  recordServiceability,
  setDeliveryPostcode,
  useDeliveryContext,
} from "@/lib/delivery-store"
import { capture } from "@/lib/telemetry"

/**
 * "Do we deliver to you?" — answered in the header, before a cart exists (025 US1 / FR-012, FR-014).
 *
 * This is the single most Uber-Eats-like change in the refresh, and it closes the storefront's worst
 * gap: until now a shopper could browse the catalogue, build a cart, sign in, and only discover at
 * checkout that Effy does not serve their address.
 *
 * ── Why a native <dialog> and no component library ───────────────────────────────────────────────
 *
 * This renders on every public page, and the guest path is byte-budgeted and machine-guarded
 * (contracts/customer-ui.contract.md §1 — radix/sonner/vaul are forbidden here and dependency-cruiser
 * enforces it). `<dialog>` gives focus trapping, Escape-to-close, inert background and the top layer
 * natively, for zero kilobytes.
 */
export function DeliveryAffordance({ className }: { className?: string }) {
  const context = useDeliveryContext()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const open = useCallback(() => {
    setDraft(context?.postcode ?? "")
    setError(null)
    dialogRef.current?.showModal()
  }, [context?.postcode])

  const check = useCallback(async (postcode: string) => {
    setChecking(true)
    try {
      const res = await fetch(
        `${coreApiBaseUrl()}/v1/storefront/serviceability?postcode=${encodeURIComponent(postcode)}`,
      )
      if (!res.ok) return // 4xx/5xx → leave `serviced` null; the UI says "we couldn't check"
      const data: { postcode: string; serviced: boolean } = await res.json()
      recordServiceability(data.postcode, data.serviced)
      // ⚠ NEVER attach the postcode to telemetry. It is location data about an individual, and
      // Principle VII allows no PII beyond the auth subject id. The boolean answers the product
      // question ("what share of visitors are outside a serviced zone?") without identifying anyone.
      capture({ name: "delivery_location_set", props: { serviced: data.serviced } })
    } catch {
      // Offline or blocked — `serviced` stays null, which renders as "we couldn't check", never as a
      // refusal. Telling a prospective customer Effy does not deliver to them because a fetch failed
      // is the one outcome this whole feature exists to avoid.
    } finally {
      setChecking(false)
    }
  }, [])

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const postcode = setDeliveryPostcode(draft)
      if (!postcode) {
        // "That isn't a postcode" — deliberately NOT "we don't deliver there".
        setError("Enter a 4-digit postcode.")
        return
      }
      setError(null)
      dialogRef.current?.close()
      void check(postcode)
    },
    [draft, check],
  )

  // Re-check on mount when a stored location has no answer (a previous check failed, or the shopper
  // arrived with a postcode but no verdict).
  useEffect(() => {
    if (context && context.serviced === null && !checking) void check(context.postcode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.postcode])

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={`inline-flex h-9 max-w-[10rem] items-center gap-1.5 rounded-full px-3 text-sm hover:bg-accent sm:max-w-none ${className ?? ""}`}
        aria-label={
          context ? `Delivering to ${context.postcode}. Change delivery location` : "Set delivery location"
        }
      >
        <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">
          {context ? (
            <>
              <span className="text-muted-foreground">Deliver to </span>
              <span className="font-medium">{context.postcode}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Set location</span>
          )}
        </span>
      </button>

      {/* The verdict, announced when it changes — a shopper using a screen reader must learn this
          without having to go looking for it (FR-045). */}
      <span role="status" aria-live="polite" className="sr-only">
        {context?.serviced === true && `Effy delivers to ${context.postcode}.`}
        {context?.serviced === false && `Effy does not deliver to ${context.postcode} yet.`}
      </span>

      <dialog
        ref={dialogRef}
        className="fx-dialog fx-dialog-modal m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-background p-0 text-foreground backdrop:bg-black/40"
        aria-labelledby="delivery-dialog-title"
        // Light dismiss. A native <dialog> closes on Escape and NOTHING else — which on a phone,
        // where there is no Escape key, leaves the close button as the only way out. A click whose
        // target is the dialog element itself landed on the backdrop (the panel's children cover the
        // whole box, `p-0`), so this closes on tap-outside without swallowing any interior click.
        // ⚠ Not the `closedby="any"` attribute: still too new to rely on as the only exit.
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close()
        }}
      >
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 id="delivery-dialog-title" className="text-base font-semibold">
              Delivery location
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              We&rsquo;ll tell you straight away whether we deliver to you.
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="-mr-1 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4">
          <label htmlFor="delivery-postcode" className="text-sm font-medium">
            Postcode
          </label>
          <input
            id="delivery-postcode"
            name="postcode"
            inputMode="numeric"
            autoComplete="postal-code"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setError(null)
            }}
            placeholder="3000"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "delivery-postcode-error" : undefined}
            className="mt-1.5 h-11 w-full rounded-md border px-3 text-sm"
          />
          {error && (
            <p id="delivery-postcode-error" role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Check
            </button>
            {context && (
              <button
                type="button"
                onClick={() => {
                  clearDeliveryContext()
                  dialogRef.current?.close()
                }}
                className="inline-flex h-10 items-center justify-center rounded-full border px-5 text-sm hover:bg-accent"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </dialog>
    </>
  )
}

/**
 * The verdict banner, shown in the page body rather than the header so it has room for plain language.
 *
 * ⚠ Three states, and conflating any two of them is the failure mode:
 *   serviced === true   → we deliver
 *   serviced === false  → we do not deliver (browsing continues to work — FR-014)
 *   serviced === null   → we have not asked, or the check failed. NOT a refusal.
 */
export function DeliveryNotice() {
  const context = useDeliveryContext()
  if (!context || context.serviced !== false) return null
  return (
    <div className="mx-4 mt-4 rounded-lg border border-dashed px-4 py-3 text-sm sm:mx-6">
      <p className="font-medium">We don&rsquo;t deliver to {context.postcode} yet.</p>
      <p className="mt-1 text-muted-foreground">
        You&rsquo;re welcome to keep browsing — we&rsquo;re adding new areas regularly. Change your
        location from the header if you entered it by mistake.
      </p>
    </div>
  )
}
