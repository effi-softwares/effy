"use client"

import { Minus, Plus, Trash2 } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

import type { GuestCartLine } from "@/lib/cart-store"
import { groupByPackage, removeFromCart, setCartQty, useCart } from "@/lib/cart-store"
import { computeCartTotals } from "@/lib/cart-totals"
import { formatMoney } from "@/lib/money"

/**
 * The cart. ONE unified Effy order that pays once — but now shown PACKAGE-AWARE (021 FR-005a): items are
 * grouped into anonymous packages (one per fulfilling shop), so the customer sees the multi-delivery
 * split early. NEVER a shop name, code, or location (SC-006) — only a positional "Package N". Prices
 * and windows are absent here (delivery is geographic and needs an address — it is quoted at checkout).
 * A single-package cart shows no artificial "Package 1 of 1" framing (FR-007/SC-011).
 */
export default function CartPage() {
  const lines = useCart()
  const totals = computeCartTotals(lines)
  const currency = lines[0]?.currency ?? "AUD"
  const packages = groupByPackage(lines)
  const split = packages.length > 1

  if (lines.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">Browse the store and add something you like.</p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Start shopping
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your cart</h1>

      {split && (
        <p className="mb-4 rounded-md bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          Your order will arrive in {packages.length} packages. You’ll choose delivery for each at
          checkout.
        </p>
      )}

      {packages.map((pkg, i) => (
        <section key={pkg.packageKey} className={i > 0 ? "mt-6" : undefined}>
          {split && (
            <h2 className="mb-1 text-sm font-medium text-muted-foreground">Package {i + 1}</h2>
          )}
          <ul className="divide-y border-t">
            {pkg.lines.map((line) => (
              <CartLineRow key={line.productId} line={line} />
            ))}
          </ul>
        </section>
      ))}

      <dl className="mt-6 space-y-2 border-t pt-6 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Items</dt>
          <dd>{formatMoney(totals.itemSubtotal, currency)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Delivery</dt>
          <dd className="text-muted-foreground">Calculated at checkout</dd>
        </div>
      </dl>

      <Link
        href="/checkout"
        className="mt-6 flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Checkout
      </Link>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        You’ll sign in at checkout. Your cart is kept.
      </p>
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

        <div className="mt-2 flex items-center gap-3">
          <div className="flex items-center rounded-md border">
            <button
              type="button"
              onClick={() => setCartQty(line.productId, line.quantity - 1)}
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
              onClick={() => setCartQty(line.productId, line.quantity + 1)}
              className="flex size-8 items-center justify-center hover:bg-accent disabled:opacity-40"
              disabled={line.quantity >= 99}
              aria-label="Increase quantity"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => removeFromCart(line.productId)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="size-3.5" /> Remove
          </button>
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
