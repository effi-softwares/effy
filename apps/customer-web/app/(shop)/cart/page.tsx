"use client"

import { ArrowRight, CircleAlert, Lock, Minus, Plus, ShoppingCart } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { ProductSearchResultDTO, StorefrontProductCardDTO } from "@effy/shared-types"

import { ActionLink, btnClass } from "@/components/storefront/actions"
import { Alert } from "@/components/ui/alert"
import { Breadcrumb } from "@/components/ui/misc"
import {
  addItem,
  clearAll,
  deleteSavedItem,
  removeItem,
  restoreSavedItem,
  setAsideItem,
  setItemQuantity,
} from "@/lib/cart-actions"
import type { GuestCartLine } from "@/lib/cart-store"
import { useCartMirror } from "@/lib/cart-store"
import { refreshCart } from "@/lib/cart-sync"
import { edgeApiBaseUrl } from "@/lib/config"
import { formatMoney } from "@/lib/money"
import { toast } from "@/lib/toast-store"

import { PaymentMarks } from "../_components/PaymentMarks"
import { ProductRail } from "../_components/ProductRail"
import { PromoField } from "./PromoField"

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
  const saved = cart.savedLines

  useEffect(() => {
    void refreshCart()
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

  const currency = cart.currency || lines[0]?.currency || "AUD"
  const count = lines.reduce((n, l) => n + l.quantity, 0)
  const confirmRef = useRef<HTMLDialogElement>(null)

  /** Empty the cart, and hand back a way to undo it (FR-025). The emptied lines live only as long as
   *  the toast: nothing is stored anywhere to make this possible. */
  function emptyCart() {
    const before = lines.map((l) => ({ ...l }))
    confirmRef.current?.close()
    clearAll()
    toast("Your cart was emptied", {
      action: { label: "Undo", run: () => before.forEach((l) => addItem(l)) },
    })
  }

  return (
    <div className="container py-6">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Cart" }]} />

      {lines.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-16 text-center">
          <span className="mb-2 grid size-12 place-items-center rounded-lg bg-muted">
            <ShoppingCart aria-hidden="true" className="size-6" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Your cart is empty</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Browse the aisles and add something you like. Anything you save for later stays below.
          </p>
          <ActionLink href="/" size="lg" className="mt-2">
            Start shopping
          </ActionLink>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Your cart{" "}
              <span className="text-base font-normal tracking-normal text-muted-foreground">
                · {count} {count === 1 ? "item" : "items"}
              </span>
            </h1>
            <button type="button" onClick={() => confirmRef.current?.showModal()} className={btnClass("ghost", "sm")}>
              Empty cart
            </button>
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
            <ul className="divide-y rounded-lg border shadow-xs">
              {lines.map((line) => (
                <CartLineRow key={line.productId} line={line} />
              ))}
            </ul>

            <aside className="rounded-lg border p-6 shadow-xs lg:sticky lg:top-40">
              <h2 className="font-semibold">Order summary</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt>Items ({count})</dt>
                  <dd className="tabular-nums">{formatMoney(cart.itemSubtotalAmount, currency)}</dd>
                </div>
                {cart.discount ? (
                  <div className="flex items-center justify-between text-brand">
                    <dt>
                      {cart.discount.label} ({cart.discount.code})
                    </dt>
                    <dd className="tabular-nums">−{formatMoney(cart.discount.amount, currency)}</dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <dt>Delivery</dt>
                  <dd className="text-muted-foreground">Calculated at checkout</dd>
                </div>
                <div className="flex items-baseline justify-between border-t pt-3">
                  <dt className="text-base font-semibold">Total</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {formatMoney(cart.grandTotalAmount, currency)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">+ delivery</span>
                  </dd>
                </div>
              </dl>

              <div className="mt-4">
                <PromoField applied={cart.discount} />
              </div>

              {cart.checkout.allowed ? (
                <ActionLink href="/checkout" size="xl" className="mt-4 w-full">
                  Go to checkout
                  <ArrowRight aria-hidden="true" />
                </ActionLink>
              ) : (
                <>
                  <Alert variant="destructive" className="mt-4" title="You can't check out yet">
                    {cart.checkout.blockedReason === "no_payable_items"
                      ? "Nothing in your cart is available right now."
                      : cart.checkout.blockedReason === "below_minimum"
                        ? `Add ${formatMoney(cart.checkout.remainingAmount ?? "0.00", currency)} more to reach the ${formatMoney(cart.checkout.minimumSubtotalAmount ?? "0.00", currency)} minimum.`
                        : "Your cart is empty."}
                  </Alert>
                  <span aria-disabled="true" className={btnClass("primary", "xl", "mt-3 w-full")}>
                    Go to checkout
                  </span>
                </>
              )}
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Lock aria-hidden="true" className="size-3.5" />
                Secure checkout. Sign in to complete your order.
              </p>
              <PaymentMarks className="mt-4 justify-center" />
            </aside>
          </div>
        </>
      )}

      {saved.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">
            Saved for later{" "}
            <span className="text-base font-normal text-muted-foreground">· {saved.length}</span>
          </h2>
          <ul className="mt-4 divide-y rounded-lg border shadow-xs">
            {saved.map((line) => (
              <SavedLineRow key={line.productId} line={line} />
            ))}
          </ul>
        </section>
      )}

      <OnSaleRail />

      <dialog
        ref={confirmRef}
        aria-labelledby="empty-cart-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) confirmRef.current?.close()
        }}
        className="fx-dialog fx-dialog-modal fx-responsive m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border bg-background p-6 text-foreground shadow-lg"
      >
        <h2 id="empty-cart-title" className="text-lg font-semibold">
          Empty your cart?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This removes all {count} {count === 1 ? "item" : "items"}. Anything saved for later stays.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => confirmRef.current?.close()} className={btnClass("outline", "lg")}>
            Keep my cart
          </button>
          <button type="button" onClick={emptyCart} className={btnClass("destructive", "lg")}>
            Empty cart
          </button>
        </div>
      </dialog>
    </div>
  )
}

function Thumb({ line }: { line: GuestCartLine }) {
  return (
    <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
      {line.imageUrl && <Image src={line.imageUrl} alt="" fill unoptimized sizes="5rem" className="object-cover" />}
    </div>
  )
}

const textAction = "text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"

function CartLineRow({ line }: { line: GuestCartLine }) {
  const [busy, setBusy] = useState(false)

  function remove() {
    removeItem(line.productId)
    void import("@/lib/telemetry").then(({ capture }) =>
      capture({ name: "product_removed_from_cart", props: { productId: line.productId } }),
    )
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
  }

  /** Save for later is per customer; a guest's request fails and says why (the routes need a session). */
  async function saveForLater() {
    setBusy(true)
    const ok = await setAsideItem(line.productId)
    setBusy(false)
    toast(ok ? `Saved ${line.name} for later` : "Sign in to save items for later")
  }

  return (
    <li className="flex gap-4 p-4">
      <Thumb line={line} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4">
          <Link href={`/product/${line.productId}`} className="text-sm font-medium hover:underline">
            {line.name}
          </Link>
          <span className="text-sm font-semibold tabular-nums">
            {formatMoney((parseFloatSafe(line.unitPriceAmount) * line.quantity).toFixed(2), line.currency)}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          {formatMoney(line.unitPriceAmount, line.currency)} each
          {line.priceChangedFrom ? ` · was ${formatMoney(line.priceChangedFrom, line.currency)}` : ""}
        </span>
        {line.available === false ? (
          <span className="mt-1 flex items-center gap-1.5 text-xs font-medium">
            <CircleAlert aria-hidden="true" className="size-3.5" />
            Unavailable — not included in your total
          </span>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex h-9 items-center rounded-md border border-input shadow-xs">
            <button
              type="button"
              onClick={() => setItemQuantity(line.productId, line.quantity - 1)}
              className="grid h-full w-9 place-items-center rounded-l-md hover:bg-accent"
              aria-label="Decrease quantity"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-8 text-center text-sm font-medium tabular-nums" aria-live="polite">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => setItemQuantity(line.productId, line.quantity + 1)}
              className="grid h-full w-9 place-items-center rounded-r-md hover:bg-accent disabled:opacity-40"
              disabled={line.quantity >= 99}
              aria-label="Increase quantity"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <button type="button" onClick={remove} className={textAction}>
            Remove
          </button>
          <button type="button" onClick={saveForLater} disabled={busy} className={textAction}>
            Save for later
          </button>
        </div>
      </div>
    </li>
  )
}

function SavedLineRow({ line }: { line: GuestCartLine }) {
  const [busy, setBusy] = useState(false)
  async function run(action: (id: string) => Promise<boolean>, failed: string) {
    setBusy(true)
    const ok = await action(line.productId)
    setBusy(false)
    if (!ok) toast(failed)
  }
  return (
    <li className="flex gap-4 p-4">
      <Thumb line={line} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={`/product/${line.productId}`} className="text-sm font-medium hover:underline">
          {line.name}
        </Link>
        <span className="text-sm text-muted-foreground">{formatMoney(line.unitPriceAmount, line.currency)} each</span>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={busy || line.available === false}
            onClick={() => run(restoreSavedItem, "We couldn't move that back just now")}
            className={btnClass("outline", "sm")}
          >
            Move to cart
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(deleteSavedItem, "We couldn't remove that just now")}
            className={textAction}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  )
}

/** "On sale now" under the cart (reference: Cart). Client-fetched, so it never holds the cart up; absent on failure. */
function OnSaleRail() {
  const [products, setProducts] = useState<StorefrontProductCardDTO[]>([])
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${edgeApiBaseUrl()}/storefront/v1/products?saleOnly=true&limit=12`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<ProductSearchResultDTO>) : null))
      .then((data) => data && setProducts(data.items))
      .catch(() => undefined)
    return () => controller.abort()
  }, [])
  if (products.length === 0) return null
  return <ProductRail title="On sale now" products={products} href="/search?saleOnly=true" className="mt-4 px-0!" />
}

function parseFloatSafe(s: string): number {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
