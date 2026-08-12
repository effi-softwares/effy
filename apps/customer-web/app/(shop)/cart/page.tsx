"use client"

import { ArrowRight, Bookmark, Minus, Plus, Trash2 } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useEffect } from "react"

import type { GuestCartLine } from "@/lib/cart-store"
import {
  addItem,
  clearAll,
  deleteSavedItem,
  removeItem,
  restoreSavedItem,
  setAsideItem,
  setItemQuantity,
} from "@/lib/cart-actions"
import { groupByPackage, useCartMirror } from "@/lib/cart-store"
import { refreshCart } from "@/lib/cart-sync"

import { PromoField } from "./PromoField"
import { toast } from "@/lib/toast-store"
import { formatMoney } from "@/lib/money"

import { Display } from "../_components/Display"
import { ActionLink } from "@/components/storefront/actions"

/**
 * The cart. ONE unified Effy order that pays once — but now shown PACKAGE-AWARE (021 FR-005a): items are
 * grouped into anonymous packages (one per fulfilling shop), so the customer sees the multi-delivery
 * split early. NEVER a shop name, code, or location (SC-006) — only a positional "Package N". Prices
 * and windows are absent here (delivery is geographic and needs an address — it is quoted at checkout).
 * A single-package cart shows no artificial "Package 1 of 1" framing (FR-007/SC-011).
 */
export default function CartPage() {
  const cart = useCartMirror()
  const lines = cart.lines

  // Re-price on open (027 FR-004). A cart restored from this browser's storage must show TODAY's prices
  // and availability, not the ones it was built from — for a guest (priced by `/api/cart/preview`) exactly
  // as for a signed-in shopper (whose account cart is the truth). A failure changes nothing: the mirror
  // stays, because "we could not check" must never read as "you have nothing".
  useEffect(() => {
    void refreshCart()
    // Reconcile again when the shopper comes back to this tab (FR-008) — the cart may have moved on
    // another device while they were away, and a stale tab showing a stale cart is the failure this whole
    // slice is about.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCart()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [])

  // 027: the totals come from the MIRROR, which carries the platform's own figures — so an unavailable
  // line is already excluded (FR-022) rather than being silently added up here.
  const currency = cart.currency || lines[0]?.currency || "AUD"
  const packages = groupByPackage(lines)
  const split = packages.length > 1

  if (lines.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6">
        <Display as="h1" size="section">Your cart is empty</Display>
        <p className="mt-2 text-muted-foreground">Browse the store and add something you like.</p>
        <ActionLink href="/" size="lg" className="mt-6">
          Start shopping
        </ActionLink>
      </div>
    )
  }

  return (
    <div className="container py-8">
      <Display as="h1" size="section" className="normal-case leading-tight text-left text-2xl sm:text-3xl">
        Your cart
      </Display>

      {/* The reference's split: line items on the left, the order summary on the right that
          sticks as the list scrolls. Below `lg` they stack, summary last. */}
      <div className="grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div>
          {split && (
            <p className="mb-4 rounded-md bg-background py-3 text-sm text-muted-foreground">
              Your order will arrive in {packages.length} packages. You’ll choose delivery for each at
              checkout.
            </p>
          )}

          {packages.map((pkg, i) => (
            <section key={pkg.packageKey} className={i > 0 ? "mt-6" : undefined}>
              {split && (
                <h2 className="mb-4 font-semibold text-xl text-foreground">Package {i + 1}</h2>
              )}
              <ul className="divide-y space-y-2">
                {pkg.lines.map((line) => (
                  <CartLineRow key={line.productId} line={line} />
                ))}
              </ul>
            </section>
          ))}

          {/* FR-028..FR-031: set aside for later, BELOW the payable items and visually separate — the one
              thing a shopper must never wonder is whether these are being bought. */}
          {cart.savedLines.length > 0 ? (
            <section className="mt-8 border-t pt-6">
              <h2 className="text-lg font-bold">Saved for later ({cart.savedLines.length})</h2>
              <p className="text-xs text-muted-foreground">Not included in your total.</p>
              <ul className="mt-4 divide-y">
                {cart.savedLines.map((line) => (
                  <li key={line.productId} className="flex items-center gap-4 py-4">
                    <div className="flex-1">
                      <span className="text-sm font-medium">{line.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatMoney(line.unitPriceAmount, line.currency)}
                      </span>
                      {line.available === false ? (
                        <span className="block text-xs font-medium text-destructive">Unavailable</span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={line.available === false}
                      onClick={() => void restoreSavedItem(line.productId)}
                      className="text-sm font-medium hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                    >
                      Move to cart
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSavedItem(line.productId)}
                      className="text-sm text-muted-foreground hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* FR-032: emptying the cart is not recoverable, so it is confirmed. */}
          {lines.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Empty your cart? Items you saved for later are kept.")) clearAll()
              }}
              className="mt-6 text-sm text-muted-foreground hover:underline"
            >
              Empty cart
            </button>
          ) : null}
        </div>

        {/* Order summary — not a card; it sits open on the right beside the list. */}
        <aside>
          <h2 className="text-xl font-bold">Order Summary</h2>
          <dl className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Items</dt>
              <dd className="font-bold">{formatMoney(cart.itemSubtotalAmount, currency)}</dd>
            </div>
            {cart.discount ? (
              /* FR-045: shown as its OWN entry. A shopper must see what they are getting, not only that
                 the total moved. */
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">
                  {cart.discount.label} ({cart.discount.code})
                </dt>
                <dd className="font-bold text-primary">
                  −{formatMoney(cart.discount.amount, currency)}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Delivery</dt>
              <dd className="text-sm text-muted-foreground">Calculated at checkout</dd>
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <dt className="text-lg">Total</dt>
                <dd className="text-2xl font-bold">
                  {formatMoney(cart.grandTotalAmount, currency)}
                  <span className="ml-1 align-middle text-xs font-normal text-muted-foreground">
                    + delivery
                  </span>
                </dd>
              </div>
            </div>
          </dl>

          <div className="mt-4">
            <PromoField applied={cart.discount} />
          </div>

          {/* FR-026/FR-054: checkout is offered only when the PLATFORM says so, and the reason is stated
              when it is not. The client never decides this itself — it is re-decided at intent (FR-056). */}
          {cart.checkout.allowed ? (
            <ActionLink href="/checkout" size="xl" className="mt-6 w-full">
              Go to checkout
              <ArrowRight className="size-4" aria-hidden="true" />
            </ActionLink>
          ) : (
            <>
              <span
                aria-disabled="true"
                className="mt-6 flex h-14 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-muted text-sm font-medium text-muted-foreground"
              >
                Go to checkout
              </span>
              <p className="mt-2 text-center text-xs font-medium text-destructive">
                {cart.checkout.blockedReason === "no_payable_items"
                  ? "Nothing in your cart is available right now."
                  : cart.checkout.blockedReason === "below_minimum"
                    ? `Add ${formatMoney(cart.checkout.remainingAmount ?? "0.00", currency)} more to reach the ${formatMoney(cart.checkout.minimumSubtotalAmount ?? "0.00", currency)} minimum.`
                    : "Your cart is empty."}
              </p>
            </>
          )}
          <p className="mt-3 text-center text-xs text-muted-foreground">
            You’ll sign in at checkout. Your cart is kept.
          </p>
        </aside>
      </div>
    </div>
  )
}

/** One cart line — the item, a quantity stepper, and its line total. Carries no shop identity. */
function CartLineRow({ line }: { line: GuestCartLine }) {
  return (
    <li className="flex gap-4 py-4">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-md border bg-muted">
        {line.imageUrl ? (
          <Image src={line.imageUrl} alt={line.name} fill unoptimized sizes="5rem" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col">
        <Link href={`/product/${line.productId}`} className="text-sm font-medium hover:underline">
          {line.name}
        </Link>
        <span className="text-sm text-muted-foreground">
          {formatMoney(line.unitPriceAmount, line.currency)} each
        </span>

        {/* FR-023/FR-024: a price that moved is SAID, with what it was. The shopper pays the current price
            either way — the point is that they find out here, not at payment. */}
        {line.priceChangedFrom ? (
          <span className="text-xs text-muted-foreground">
            Was {formatMoney(line.priceChangedFrom, line.currency)}
          </span>
        ) : null}

        {/* FR-022: an unavailable line stays visible and flagged — a temporary state may be waited out —
            but it is excluded from every total and cannot be paid for. */}
        {line.available === false ? (
          <span className="text-xs font-medium text-destructive">
            Unavailable — not included in your total
          </span>
        ) : null}

        <div className="mt-2 flex items-center gap-3">
          <div className="flex items-center rounded-full border">
            <button
              type="button"
              onClick={() => setItemQuantity(line.productId, line.quantity - 1)}
              className="flex size-8 items-center justify-center hover:bg-accent"
              aria-label="Decrease quantity"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-8 text-center text-sm" aria-live="polite">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => setItemQuantity(line.productId, line.quantity + 1)}
              className="flex size-8 items-center justify-center hover:bg-accent disabled:opacity-40"
              disabled={line.quantity >= 99}
              aria-label="Increase quantity"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="ml-4 flex items-center gap-4">
          {/* FR-028: the non-destructive alternative to Remove. Without it "I'm not sure about this" has
              only one answer — delete — and shoppers avoid that by abandoning the whole cart. */}
          <button
            type="button"
            onClick={() => void setAsideItem(line.productId)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Bookmark className="size-3.5" /> Save for later
          </button>
          <button
            type="button"
            onClick={() => {
              removeItem(line.productId)
              // Dynamic for the same measured reason as PromoField's: a static telemetry import from a
              // cart client component costs +1.0 KB on four GUEST routes and breaks the budget.
              void import("@/lib/telemetry").then(({ capture }) =>
                capture({ name: "product_removed_from_cart", props: { productId: line.productId } }),
              )
              // 025 FR-041: reversible from its own acknowledgement. Removing the wrong line is a
              // one-tap mistake, and without undo the recovery is "find it again and re-add it".
              toast(`Removed ${line.name}`, {
                action: {
                  label: "Undo",
                  run: () =>
                    addItem({
                      productId: line.productId,
                      name: line.name,
                      imageUrl: line.imageUrl,
                      unitPriceAmount: line.unitPriceAmount,
                      currency: line.currency,
                      quantity: line.quantity,
                      packageKey: line.packageKey,
                    }),
                },
              })
            }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="size-3.5" /> Remove
          </button>
          </div>
        </div>
      </div>

      <div className="text-sm font-medium">
        {formatMoney((parseFloatSafe(line.unitPriceAmount) * line.quantity).toFixed(2), line.currency)}
      </div>
    </li>
  )
}

function parseFloatSafe(s: string): number {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
