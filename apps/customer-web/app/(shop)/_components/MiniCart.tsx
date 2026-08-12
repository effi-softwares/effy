"use client"

import { ShoppingCart, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useRef } from "react"

import { removeItem, setItemQuantity } from "@/lib/cart-actions"
import { useCart } from "@/lib/cart-store"
import { computeCartTotals } from "@/lib/cart-totals"
import { formatMoney } from "@/lib/money"

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
        onClick={() => dialogRef.current?.showModal()}
        className="relative inline-flex size-9 items-center justify-center rounded-full hover:bg-accent"
        aria-label={count > 0 ? `Cart, ${count} items` : "Cart"}
      >
        <ShoppingCart className="size-5" aria-hidden="true" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {/* `ml-auto` + `h-full` pins the panel to the right edge at full height; without them a
          <dialog> centres itself, which is the one thing a drawer must not do. `max-h-none` and
          `max-w-none` undo the UA's default
          `max-width: calc(100% - 6px - 2em)` box, or the panel stops short of the edge. */}
      <dialog
        ref={dialogRef}
        className="fx-dialog fx-drawer-right ml-auto h-full max-h-none w-[min(26rem,92vw)] max-w-none border-l bg-card p-0 text-foreground backdrop:bg-foreground/40"
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
          <div className="flex items-center justify-between border-b px-5 py-4">
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
              className="-mr-1 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          {lines.length === 0 ? (
            // `flex-1` + centring: an empty drawer is full-height, so the message belongs in the
            // middle of the panel rather than stranded against the header.
            <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
              <ShoppingCart className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-4 text-sm text-muted-foreground">Your cart is empty.</p>
              {/* FR-044: a route back into the catalogue, never a dead end. */}
              <Link
                href="/search"
                onClick={close}
                className="mt-5 inline-flex h-11 items-center rounded-full border px-6 text-sm hover:bg-accent"
              >
                Browse products
              </Link>
            </div>
          ) : (
            <>
              {/* The only scrolling region. The header and the footer are pinned by the flex column,
                  so the subtotal and the primary action never scroll out of reach — which on a long
                  cart is the difference between a usable drawer and one you have to hunt through. */}
              <ul className="flex-1 divide-y overflow-y-auto px-5">
                {lines.map((line) => (
                  <li key={line.productId} className="flex gap-3 py-4">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {line.imageUrl && (
                        <Image
                          src={line.imageUrl}
                          alt=""
                          fill
                          unoptimized
                          sizes="4rem"
                          className="object-cover"
                        />
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="line-clamp-2 text-sm font-medium">{line.name}</span>
                      <span className="mt-0.5 text-xs text-muted-foreground">
                        {formatMoney(line.unitPriceAmount, line.currency)} each
                      </span>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        {/* One bordered group rather than two loose buttons: it reads as a single
                            control operating on the number between them.
                            ⚠ `leading-none` on the glyphs — `−` and `+` sit on different baselines
                            to the box, and without it the row looks a pixel out of true. */}
                        <div className="inline-flex items-center rounded-full border">
                          <button
                            type="button"
                            onClick={() => setItemQuantity(line.productId, line.quantity - 1)}
                            aria-label={`Decrease quantity of ${line.name}`}
                            className="inline-flex size-8 items-center justify-center rounded-full text-base leading-none hover:bg-accent"
                          >
                            −
                          </button>
                          <span className="w-7 text-center text-sm tabular-nums">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => setItemQuantity(line.productId, line.quantity + 1)}
                            aria-label={`Increase quantity of ${line.name}`}
                            className="inline-flex size-8 items-center justify-center rounded-full text-base leading-none hover:bg-accent"
                          >
                            +
                          </button>
                        </div>

                        <span className="text-sm font-semibold tabular-nums">
                          {formatMoney(computeCartTotals([line]).itemSubtotal, line.currency)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(line.productId)}
                        // The accessible name carries the product; "Remove" alone, repeated down a
                        // list, tells a screen-reader user nothing about WHICH thing goes.
                        aria-label={`Remove ${line.name}`}
                        className="mt-2 self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="border-t px-5 py-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Items</span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(totals.itemSubtotal, currency)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Delivery calculated at checkout.
                </p>
                <Link
                  href="/cart"
                  onClick={goToCart}
                  className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Go to cart
                </Link>
                <button
                  type="button"
                  onClick={close}
                  className="mt-2 flex h-11 w-full items-center justify-center rounded-full text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Continue shopping
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  )
}
