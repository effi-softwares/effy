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

/** The snapshot an add-to-cart captures (price/name/image frozen at add time — R8). */
interface AddToCartProduct {
  /** 098 — the size being bought: the cart line's identity. */
  variantId: string
  productId: string
  name: string
  /** 098 — the size's words, carried onto the line ("1 kg"). */
  variantLabel?: string | null
  unitPrice?: UnitPriceDTO | null
  imageUrl: string | null
  imageWidths?: number[]
  unitPriceAmount: string
  currency: string
  available: boolean
  /**
   * OPAQUE package-grouping token (021 FR-005a) sourced from the product, captured onto the guest line
   * so the cart can show the anonymous split. NOT a shop id/name/location. Absent until the storefront
   * read carries it — then everything falls into one package (single-package cart, FR-007/SC-011).
   */
  packageKey?: string
}

/** Quantity stepper + Add to cart (US2). Writes to the device-local guest cart and confirms briefly. */
export function AddToCartControl({
  product,
  unavailableText = "This item is currently unavailable.",
}: {
  product: AddToCartProduct
  /** 098 — what to say when THIS size cannot be bought ("This size is sold out."). */
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
      unitPrice: product.unitPrice ?? null,
      imageUrl: product.imageUrl,
      ...(product.imageWidths ? { imageWidths: product.imageWidths } : {}),
      unitPriceAmount: product.unitPriceAmount,
      currency: product.currency,
      quantity: qty,
      packageKey: product.packageKey ?? DEFAULT_PACKAGE_KEY,
    })
    // ⚠ DYNAMIC import (027's rule). A static `import { capture } from "@/lib/telemetry"`
    // here rides the ALWAYS-LOADED guest chunk and cost +1.0 KB on four routes last time it
    // was tried. Paying for the module at the moment of the event costs a guest nothing.
    void import("@/lib/telemetry").then(({ capture }) =>
      capture({ name: "product_added_to_cart", props: { productId: product.productId, variantId: product.variantId, quantity: qty } }),
    )
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2000)
    // 025 FR-039: acknowledge the add and offer the cart WITHOUT navigating there. The silent add is
    // what produces duplicate adds — a shopper who cannot tell it worked tries again.
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
