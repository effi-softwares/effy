"use client"

import { Minus, Plus, ShoppingCart } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { addToCart, DEFAULT_PACKAGE_KEY } from "@/lib/cart-store"
import { formatMoney } from "@/lib/money"
import { capture } from "@/lib/telemetry"
import { toast } from "@/lib/toast-store"

/** The snapshot an add-to-cart captures (price/name/image frozen at add time — R8). */
interface AddToCartProduct {
  productId: string
  name: string
  imageUrl: string | null
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
export function AddToCartControl({ product }: { product: AddToCartProduct }) {
  const router = useRouter()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  if (!product.available) {
    return (
      <p className="rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
        This item is currently unavailable.
      </p>
    )
  }

  function add() {
    addToCart({
      productId: product.productId,
      name: product.name,
      imageUrl: product.imageUrl,
      unitPriceAmount: product.unitPriceAmount,
      currency: product.currency,
      quantity: qty,
      packageKey: product.packageKey ?? DEFAULT_PACKAGE_KEY,
    })
    capture({ name: "product_added_to_cart", props: { productId: product.productId, quantity: qty } })
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2000)
    // 025 FR-039: acknowledge the add and offer the cart WITHOUT navigating there. The silent add is
    // what produces duplicate adds — a shopper who cannot tell it worked tries again.
    toast(qty === 1 ? "Added to cart" : `Added ${qty} to cart`, {
      action: { label: "View cart", run: () => router.push("/cart") },
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center rounded-full bg-background">
        <button
          type="button"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="flex size-10 items-center justify-center hover:bg-accent disabled:opacity-40"
          disabled={qty <= 1}
          aria-label="Decrease quantity"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-10 text-center text-sm font-medium" aria-live="polite">
          {qty}
        </span>
        <button
          type="button"
          onClick={() => setQty((q) => Math.min(99, q + 1))}
          className="flex size-10 items-center justify-center hover:bg-accent disabled:opacity-40"
          disabled={qty >= 99}
          aria-label="Increase quantity"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={add}
        className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-8 text-sm font-medium text-primary-foreground hover:opacity-90 sm:flex-none"
      >
        <ShoppingCart className="size-4" />
        {added ? "Added" : "Add to cart"}
      </button>

      {/* 025 FR-024: the line total, so choosing a quantity does not require mental arithmetic to
          know what is about to be added. Shown only when it differs from the unit price. */}
      {qty > 1 && (
        <span className="text-sm text-muted-foreground">
          Total{" "}
          <span className="font-medium text-foreground">
            {formatMoney((Number(product.unitPriceAmount) * qty).toFixed(2), product.currency)}
          </span>
        </span>
      )}
    </div>
  )
}
