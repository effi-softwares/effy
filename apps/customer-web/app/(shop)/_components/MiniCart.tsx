"use client"

import { ShoppingCart, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRef } from "react"

import { removeItem, setItemQuantity } from "@/lib/cart-actions"
import { useCart } from "@/lib/cart-store"
import { computeCartTotals } from "@/lib/cart-totals"
import { formatMoney } from "@/lib/money"

/**
 * Review and adjust the cart without leaving the page (025 US4 / FR-040).
 *
 * ⚠ The behaviour that matters is what it does NOT do: navigate. A shopper mid-browse who wants to
 * check what they have should not lose their place in a result set to find out — that is a trip they
 * often do not come back from.
 *
 * A native `<dialog>` again: focus trapping, Escape, inert background and top-layer stacking for zero
 * kilobytes on a byte-budgeted route (contracts/customer-ui.contract.md §1).
 */
export function MiniCart() {
  const lines = useCart()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const totals = computeCartTotals(lines)
  const currency = lines[0]?.currency ?? "AUD"
  const count = lines.reduce((n, l) => n + l.quantity, 0)

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

      <dialog
        ref={dialogRef}
        className="fx-dialog fx-dialog-modal m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border bg-background p-0 text-foreground backdrop:bg-black/40"
        aria-labelledby="mini-cart-title"
        // Light dismiss. A native <dialog> closes on Escape and NOTHING else — which on a phone,
        // where there is no Escape key, leaves the close button as the only way out. A click whose
        // target is the dialog element itself landed on the backdrop (the panel's children cover the
        // whole box, `p-0`), so this closes on tap-outside without swallowing any interior click.
        // ⚠ Not the `closedby="any"` attribute: still too new to rely on as the only exit.
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close()
        }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 id="mini-cart-title" className="text-base font-semibold">
            Your cart
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="-mr-1 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">Your cart is empty.</p>
            {/* FR-044: a route back into the catalogue, never a dead end. */}
            <Link
              href="/search"
              onClick={() => dialogRef.current?.close()}
              className="mt-4 inline-flex h-10 items-center rounded-full border px-5 text-sm hover:bg-accent"
            >
              Browse products
            </Link>
          </div>
        ) : (
          <>
            <ul className="max-h-[50vh] divide-y overflow-y-auto px-5">
              {lines.map((line) => (
                <li key={line.productId} className="flex gap-3 py-3">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-full border bg-muted">
                    {line.imageUrl && (
                      <Image
                        src={line.imageUrl}
                        alt=""
                        fill
                        unoptimized
                        sizes="3.5rem"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-medium">{line.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatMoney(line.unitPriceAmount, line.currency)} each
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setItemQuantity(line.productId, line.quantity - 1)}
                        aria-label={`Decrease quantity of ${line.name}`}
                        className="flex size-7 items-center justify-center rounded border hover:bg-accent"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => setItemQuantity(line.productId, line.quantity + 1)}
                        aria-label={`Increase quantity of ${line.name}`}
                        className="flex size-7 items-center justify-center rounded border hover:bg-accent"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(line.productId)}
                        className="ml-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t px-5 py-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Items</span>
                <span className="font-medium">{formatMoney(totals.itemSubtotal, currency)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Delivery calculated at checkout.</p>
              <Link
                href="/cart"
                onClick={() => dialogRef.current?.close()}
                className="mt-3 flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Go to cart
              </Link>
            </div>
          </>
        )}
      </dialog>
    </>
  )
}
