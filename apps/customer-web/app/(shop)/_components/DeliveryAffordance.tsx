"use client"

import dynamic from "next/dynamic"
import { MapPin } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { formatPlace } from "@/lib/delivery-display"
import { seedFromAccount, useDeliveryContext } from "@/lib/delivery-store"

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
 *
 * ── ⚠ WHY THIS FILE IS A SHELL (030 T027 / FR-043) ──────────────────────────────────────────────
 *
 * It renders on EVERY public route, and the measured headroom on `/cart` is **0.2 KB**. So this file
 * holds only what a shopper who never opens the dialog actually needs:
 *
 *   • the button and the place it displays
 *   • the screen-reader verdict
 *   • the `<dialog>` element itself
 *   • the mount re-check for a restored location with no answer
 *
 * Everything else — the form, the input, the locality search — is in `DeliveryPanel`, loaded via
 * `next/dynamic` the first time the dialog opens.
 *
 * ⚠ Adding anything to this file spends from 0.2 KB. Adding it to `DeliveryPanel` is free. When in
 * doubt, it goes in the panel.
 */
// ⚠ No `loading:` fallback. It would be JSX in the ALWAYS-LOADED shell, paid for on all six public
// routes, to serve a flash that lasts one chunk fetch inside an already-framed dialog. At ~0.1 KB of
// headroom that trade is not available (FR-043/FR-044).
const DeliveryPanel = dynamic(() => import("./DeliveryPanel"), { ssr: false })

export function DeliveryAffordance({
  className,
  seed,
}: {
  className?: string
  /**
   * The signed-in shopper's default place, supplied by the `DeliverySeed` server island (030 FR-018).
   *
   * ⚠ Applied through `seedFromAccount`, which is a no-op when a location is already set — an
   * explicit choice on this device outranks a saved default (FR-019).
   */
  seed?: { postcode: string; locality?: string | null; state?: string | null }
}) {
  const context = useDeliveryContext()
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Gates the dynamic import: the panel module is not fetched until the shopper opens the dialog.
  const [opened, setOpened] = useState(false)

  const open = useCallback(() => {
    setOpened(true)
    dialogRef.current?.showModal()
  }, [])

  const close = useCallback(() => dialogRef.current?.close(), [])

  // ⚠ ONE effect, doing both jobs in order: seed a signed-in shopper's default place, then verify
  // whatever location is now set if it has no answer yet. They were two effects and two pieces of
  // state; merged because this file is always-loaded on six public routes with ~0.1 KB of headroom,
  // and two closures plus a `useState` did not fit. Behaviour is identical (030 FR-018, FR-019).
  //
  // ⚠ The check is DYNAMICALLY imported. A static import pulls `lib/config` and the fetch into the
  // always-loaded chrome to serve a case that only arises when a stored location has no verdict.
  const checking = useRef(false)
  useEffect(() => {
    if (seed) seedFromAccount(seed)
    if (context && context.serviced === null && !checking.current) {
      checking.current = true
      void import("@/lib/delivery-check")
        .then((m) => m.checkServiceability(context.postcode))
        .finally(() => {
          checking.current = false
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.postcode, seed?.postcode])

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={`inline-flex h-9 max-w-[10rem] items-center gap-1.5 rounded-full px-3 text-sm hover:bg-accent sm:max-w-none ${className ?? ""}`}
        aria-label={
          context
            ? `Delivering to ${formatPlace(context)}. Change delivery location`
            : "Set delivery location"
        }
      >
        <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">
          {context ? (
            <>
              <span className="text-muted-foreground">Deliver to </span>
              {/* FR-039: the PLACE, not the bare postcode. `formatPlace` degrades to digits when the
                  locality is unknown, so this is never empty and never invents a suburb. */}
              <span className="font-medium">{formatPlace(context)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Set location</span>
          )}
        </span>
      </button>

      {/* The verdict, announced when it changes — a shopper using a screen reader must learn this
          without having to go looking for it (FR-045). */}
      {/* ⚠ FR-042: the announcement names the place in the SAME words the visible display uses —
          `announcePlace` is built from `formatPlace` so the two cannot drift apart. */}
      <span role="status" aria-live="polite" className="sr-only">
        {context?.serviced === true && `Effy delivers to ${formatPlace(context)}.`}
        {context?.serviced === false && `Effy does not deliver to ${formatPlace(context)} yet.`}
      </span>

      <dialog
        ref={dialogRef}
        // ⚠ `max-h` + `overflow-y-auto`: with eight suggestions, the verdict and the actions, the panel is
        // taller than a small viewport and a native <dialog> does not scroll on its own — the Check
        // button simply ends up off-screen. `dvh` rather than `vh` so a mobile browser's collapsing
        // toolbar does not clip it.
        className="fx-dialog fx-dialog-modal m-auto max-h-[calc(100dvh-4rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-background p-0 text-foreground backdrop:bg-black/40"
        aria-labelledby="delivery-dialog-title"
        // Light dismiss. A native <dialog> closes on Escape and NOTHING else — which on a phone,
        // where there is no Escape key, leaves the close button as the only way out. A click whose
        // target is the dialog element itself landed on the backdrop (the panel's children cover the
        // whole box, `p-0`), so this closes on tap-outside without swallowing any interior click.
        // ⚠ Not the `closedby="any"` attribute: still too new to rely on as the only exit.
        onClick={(e) => {
          if (e.target === e.currentTarget) close()
        }}
      >
        {/* ⚠ Gated on `opened`, which is what makes the dynamic import lazy. Rendering the panel
            unconditionally would fetch its chunk on every page load and defeat the whole split. */}
        {opened && <DeliveryPanel onClose={close} />}
      </dialog>
    </>
  )
}
