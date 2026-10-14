"use client"

import { ShoppingCart, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useRef, useState } from "react"

import { useCart } from "@/lib/cart-store"
import { computeCartTotals } from "@/lib/cart-totals"
import { formatMoney } from "@/lib/money"
import { useOnDemand } from "@/lib/use-on-demand"

const loadBody = () => import("./MiniCartBody").then((m) => m.MiniCartBody)

/**
 * THE CART DRAWER — review and adjust the cart without leaving the page (025 US4 / FR-040).
 *
 * ⚠ The behaviour that matters is what it does NOT do: navigate. A shopper mid-browse who wants to
 * check what they have should not lose their place in a result set to find out — that is a trip they
 * often do not come back from.
 *
 * ── Why this is a right-edge drawer and no longer a centred dialog ──────────────────────────────
 *
 * A centred modal is the shape for a QUESTION — it interrupts, it wants an answer, and it covers the
 * thing you were looking at to get one. The cart is not a question. It is a running tally you glance
 * at and dismiss, usually to carry straight on shopping, and it belongs beside the page rather than
 * on top of its middle. The drawer hinges on the RIGHT because that is where the control that opens
 * it lives (the header's right-hand action cluster) — the panel arrives under your thumb, next to the
 * icon you just pressed, instead of crossing the viewport to appear somewhere unrelated.
 *
 * ── Why not shadcn's <Drawer> ───────────────────────────────────────────────────────────────────
 *
 * It is the platform standard, and on this route it is unaffordable. `vaul` measures 16.8 KB gz on
 * its own and pulls `@radix-ui/react-dialog` and its focus/scroll/portal stack behind it — roughly
 * 25 KB gz, on EVERY public route, against a 174 KB gate that guest pages already sit 1–6 KB under.
 * `contracts/customer-ui.contract.md §1` forbids `vaul`/`radix-ui` from being reachable from
 * `app/(shop)/` for exactly this reason, and dependency-cruiser fails the build if either becomes so
 * — it names the mini-cart in the rule's own comment.
 *
 * So this is the same drawer, built from what the platform gives away free. `<dialog>` +
 * `showModal()` provides focus trapping, Escape-to-close, an inert background and top-layer stacking
 * natively; the slide-in is `.fx-drawer-right` in `globals.css`, the mirror of the menu's
 * `.fx-drawer-left`. The one thing vaul would add and this does not have is drag-to-dismiss.
 *
 * ⚠ AND IT IMPORTS EXACTLY TWO ICONS, deliberately. This component is in the CHROME — it is on every
 * public route — so a `lucide-react` import here does not land on the cart page, it lands in the
 * SHARED chunk every guest downloads. A first cut used `ArrowRight`/`Minus`/`Plus`/`Trash2` for the
 * stepper, the remove control and the CTA; measured, those four cost +0.5 KB gz on all nine guest
 * routes and put `/search` 0.2 KB OVER the 174 KB gate. They are decoration — the stepper reads
 * identically as `−`/`+` glyphs and "Remove" says more than a bin does — so they were paid back
 * rather than the budget being raised. Adding an icon here is never local; measure it.
 */
export function MiniCart() {
  const lines = useCart()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const totals = computeCartTotals(lines)
  const currency = lines[0]?.currency ?? "AUD"
  const count = lines.reduce((n, l) => n + l.quantity, 0)

  // The drawer's contents are fetched once the shopper shows they want them — pointer or focus on
  // the button, or the press itself — and stay loaded. See `MiniCartBody`.
  const [wanted, setWanted] = useState(false)
  const want = useCallback(() => setWanted(true), [])
  const Body = useOnDemand(loadBody, wanted)

  const close = useCallback(() => dialogRef.current?.close(), [])

  /**
   * "Go to cart" — the one control here that is SUPPOSED to navigate, and the drawer must be out of
   * the way when it lands.
   *
   * ⚠ It drives the router itself rather than leaving `<Link>` to do it after an `onClick` that
   * closes the dialog. Both handlers fire on the same click, and the order in which a top-layer
   * dismissal and a client-side navigation resolve is not something to leave to chance on the
   * storefront's primary conversion path: `close()` returns focus to the trigger and runs a
   * `allow-discrete` exit transition while Next is starting a route change. Ordering it explicitly —
   * close, then push — makes "press it and you are on the cart page" true by construction.
   *
   * It stays an `<a>` with a real `href` (hence `<Link>`, not a button): cmd/ctrl-click, middle-click,
   * "open in new tab" and a crawler all need a URL, and those paths return early so the browser keeps
   * its own behaviour.
   */
  const goToCart = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      e.preventDefault()
      close()
      router.push("/cart")
    },
    [close, router],
  )

  return (
    <>
      <button
        type="button"
        onClick={() => {
          want()
          dialogRef.current?.showModal()
        }}
        onPointerEnter={want}
        onFocus={want}
        className="ml-1 inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary pr-1 pl-3 text-sm font-medium whitespace-nowrap text-primary-foreground tabular-nums hover:bg-primary/90"
      >
        {/* ⚠ The name is BUILT FROM what is shown, plus hidden words — not an aria-label. A label
            that rewords the visible "$72.70 15" fails WCAG 2.5.3: a voice user saying what they
            see would not match it. */}
        <ShoppingCart className="size-[18px]" aria-hidden="true" />
        <span className="sr-only">Cart,</span>
        <span className="max-md:hidden">{formatMoney(totals.itemSubtotal, currency)}</span>
        {/* ⚠ An inverted chip, not `bg-white/20`: that tint lifted the blue to 4.44:1 under white
            text, below AA. The inverse pair is the primary/foreground pair the token guard holds. */}
        <span className="grid h-8 min-w-[30px] place-items-center rounded-sm bg-primary-foreground px-2 font-semibold text-primary">
          {count > 99 ? "99+" : count}
        </span>
        <span className="sr-only">{count === 1 ? "item" : "items"}</span>
      </button>

      {/* `ml-auto` + `h-full` pins the panel to the right edge at full height; without them a
          <dialog> centres itself, which is the one thing a drawer must not do. `max-h-none` and
          `max-w-none` undo the UA's default
          `max-width: calc(100% - 6px - 2em)` box, or the panel stops short of the edge. */}
      <dialog
        ref={dialogRef}
        // ⚠ `backdrop:bg-black/50` matches the design-system overlays (Dialog/Sheet/Drawer). It was
        // `bg-foreground/40`, which looks token-correct and is not: `--foreground` inverts by
        // appearance, so that scrim rendered as a WHITE film on a dark surface. A scrim must darken.
        className="fx-dialog fx-drawer-right ml-auto h-full max-h-none w-full max-w-[420px] border-l bg-background p-0 text-foreground shadow-lg"
        aria-labelledby="mini-cart-title"
        // Light dismiss. A native <dialog> closes on Escape and NOTHING else — which on a phone,
        // where there is no Escape key, leaves the close button as the only way out. A click whose
        // target is the dialog element itself landed on the backdrop (the panel's children cover the
        // whole box, `p-0`), so this closes on tap-outside without swallowing any interior click.
        // ⚠ Not the `closedby="any"` attribute: still too new to rely on as the only exit.
        onClick={(e) => {
          if (e.target === e.currentTarget) close()
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h2 id="mini-cart-title" className="text-base font-semibold">
              Your cart
              {count > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {count} {count === 1 ? "item" : "items"}
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-mr-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          {Body ? <Body close={close} goToCart={goToCart} /> : <div className="flex-1" aria-busy="true" />}
        </div>
      </dialog>
    </>
  )
}
