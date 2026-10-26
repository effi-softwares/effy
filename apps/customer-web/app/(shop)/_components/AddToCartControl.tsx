"use client"

import { Minus, Plus, ShoppingCart } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import type { UnitPriceDTO } from "@effy/shared-types"

import { ActionButton } from "@/components/storefront/actions"
import { addItem } from "@/lib/cart-actions"
import { DEFAULT_PACKAGE_KEY } from "@/lib/cart-store"
import { formatMoney } from "@/lib/money"
import { toast } from "@/lib/toast-store"

/** The snapshot an add captures (price, name and image frozen at add time). */
interface AddToCartProduct {
  /** The size being bought: the cart line's identity. */
  variantId: string
  productId: string
  name: string
  /** The size's words, carried onto the line ("1 kg"). */
  variantLabel?: string | null
  /** Sold to adults only: the line says 18+. */
  ageRestricted?: boolean
  unitPrice?: UnitPriceDTO | null
  imageUrl: string | null
  imageWidths?: number[]
  unitPriceAmount: string
  currency: string
  available: boolean
  /** The opaque package-grouping token captured onto the guest line (not a shop id); absent means one package. */
  packageKey?: string
}

/** Quantity stepper and Add to cart, writing to the device-local guest cart. */
export function AddToCartControl({
  product,
  unavailableText = "This item is currently unavailable.",
}: {
  product: AddToCartProduct
  /** What to say when this size cannot be bought ("This size is sold out."). */
  unavailableText?: string
}) {
  const router = useRouter()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  if (!product.available) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        {unavailableText}
      </p>
    )
  }

  function add() {
    addItem({
      variantId: product.variantId,
      productId: product.productId,
      name: product.name,
      variantLabel: product.variantLabel ?? null,
      ...(product.ageRestricted ? { ageRestricted: true } : {}),
      unitPrice: product.unitPrice ?? null,
      imageUrl: product.imageUrl,
      ...(product.imageWidths ? { imageWidths: product.imageWidths } : {}),
      unitPriceAmount: product.unitPriceAmount,
      currency: product.currency,
      quantity: qty,
      packageKey: product.packageKey ?? DEFAULT_PACKAGE_KEY,
    })
    // A dynamic import: a static telemetry import would ride the always-loaded guest chunk.
    void import("@/lib/telemetry").then(({ capture }) =>
      capture({ name: "product_added_to_cart", props: { productId: product.productId, variantId: product.variantId, quantity: qty } }),
    )
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2000)
    // Acknowledge the add and offer the cart without navigating: a silent add produces duplicate adds.
    toast(qty === 1 ? "Added to cart" : `Added ${qty} to cart`, {
      action: { label: "View cart", run: () => router.push("/cart") },
    })
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 items-center rounded-md border border-input shadow-xs lg:h-10">
        <button
          type="button"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="grid h-full w-10 place-items-center rounded-l-md hover:bg-accent disabled:opacity-40"
          disabled={qty <= 1}
          aria-label="Decrease quantity"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-8 text-center text-sm font-medium tabular-nums" aria-live="polite">
          {qty}
        </span>
        <button
          type="button"
          onClick={() => setQty((q) => Math.min(99, q + 1))}
          className="grid h-full w-10 place-items-center rounded-r-md hover:bg-accent disabled:opacity-40"
          disabled={qty >= 99}
          aria-label="Increase quantity"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <ActionButton type="button" onClick={add} size="xl" className="min-w-0 flex-1 lg:h-10 lg:text-sm">
        <ShoppingCart className="size-4" />
        {added
          ? "Added"
          : `Add to cart · ${formatMoney((Number(product.unitPriceAmount) * qty).toFixed(2), product.currency)}`}
      </ActionButton>
    </div>
  )
}
