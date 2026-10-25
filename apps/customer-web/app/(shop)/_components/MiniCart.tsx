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
 * The cart drawer: review and adjust the cart without navigating away. A right-edge drawer by the header
 * control that opens it, built from a native `<dialog>` (`showModal`: focus trap, Escape, inert
 * background) and `.fx-drawer-right`; shadcn's Drawer (vaul + radix, ~25 KB gz) is barred from public
 * routes by dependency-cruiser. It sits in the shared chrome chunk, so every icon import here costs every
 * guest route: measure before adding one.
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
   * "Go to cart" — the one control here that is supposed to navigate, and the drawer must be out of
   * the way when it lands.
   *
   * It drives the router itself rather than leaving `<Link>` to do it after an `onClick` that
   * closes the dialog. Both handlers fire on the same click, and the order in which a top-layer
   * dismissal and a client-side navigation resolve is not something to leave to chance on the
   * storefront's primary conversion path: `close` returns focus to the trigger and runs a
   * `allow-discrete` exit transition while Next is starting a route change. Ordering it explicitly
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
        className="ml-1 inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary-fill pr-1 pl-3 text-sm font-medium whitespace-nowrap text-primary-foreground tabular-nums hover:bg-primary-fill/90"
      >
        {/* The name is built from what is shown, plus hidden words — not an aria-label. A label
            that rewords the visible "$72.70 15" fails WCAG 2.5.3: a voice user saying what they
            see would not match it. */}
        <ShoppingCart className="size-5" aria-hidden="true" />
        <span className="sr-only">Cart,</span>
        <span className="max-md:hidden">{formatMoney(totals.itemSubtotal, currency)}</span>
        {/* An inverted chip, not `bg-white/20`: that tint lifted the blue to 4.44:1 under white
            text, below AA. The inverse pair is the primary/foreground pair the token guard holds. */}
        <span className="grid h-8 min-w-8 place-items-center rounded-sm bg-primary-foreground px-2 font-semibold text-primary">
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
        // `backdrop:bg-black/50` matches the design-system overlays (Dialog/Sheet/Drawer). It was
        // `bg-foreground/40`, which looks token-correct and is not: `--foreground` inverts by
        // appearance, so that scrim rendered as a white film on a dark surface. A scrim must darken.
        className="fx-dialog fx-drawer-right ml-auto h-full max-h-none w-full max-w-105 border-l bg-background p-0 text-foreground shadow-lg"
        aria-labelledby="mini-cart-title"
        // Light dismiss. A native <dialog> closes on Escape and nothing else — which on a phone,
        // where there is no Escape key, leaves the close button as the only way out. A click whose
        // target is the dialog element itself landed on the backdrop (the panel's children cover the
        // whole box, `p-0`), so this closes on tap-outside without swallowing any interior click.
        // Not the `closedby="any"` attribute: still too new to rely on as the only exit.
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
