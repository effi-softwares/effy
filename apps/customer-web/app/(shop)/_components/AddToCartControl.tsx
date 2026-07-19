"use client"

import { Minus, Plus, ShoppingCart } from "lucide-react"
import { useState } from "react"

import { addToCart } from "@/lib/cart-store"
import { capture } from "@/lib/telemetry"

/** The snapshot an add-to-cart captures (price/name/image frozen at add time — R8). */
interface AddToCartProduct {
  productId: string
  name: string
  imageUrl: string | null
  unitPriceAmount: string
  currency: string
  available: boolean
}

/** Quantity stepper + Add to cart (US2). Writes to the device-local guest cart and confirms briefly. */
export function AddToCartControl({ product }: { product: AddToCartProduct }) {
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  if (!product.available) {
    return (
      <p className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
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
    })
    capture({ name: "product_added_to_cart", props: { productId: product.productId, quantity: qty } })
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center rounded-md border">
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
        className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        <ShoppingCart className="size-4" />
        {added ? "Added" : "Add to cart"}
      </button>
    </div>
  )
}
