"use client"

import { Minus, Plus } from "lucide-react"
import Link from "next/link"

import { addItem, removeItem, setItemQuantity } from "@/lib/cart-actions"
import { DEFAULT_PACKAGE_KEY, useCart } from "@/lib/cart-store"

/**
 * The product card's Add control: it becomes the cart's own quantity stepper in place, so every view of
 * a product agrees. A product with more than one size on sale shows "Choose" (opening the product page)
 * rather than adding a size the shopper did not pick. No toast: the control is the confirmation.
 */
export function CardAdd({
  product,
  href,
}: {
  /** Where "Choose" goes: the product page, on this tile's size. */
  href: string
  product: {
    variantId: string
    variantCount: number
    productId: string
    name: string
    imageUrl: string | null
    imageWidths?: number[]
    unitPriceAmount: string
    currency: string
  }
}) {
  const quantity = useCart().find((l) => l.variantId === product.variantId)?.quantity ?? 0

  if (product.variantCount > 1) {
    return (
      <Link
        href={href}
        aria-label={`Choose a size of ${product.name}`}
        className="relative z-10 inline-flex h-8 shrink-0 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent"
      >
        Choose
      </Link>
    )
  }

  if (quantity === 0) {
    return (
      <button
        type="button"
        aria-label={`Add ${product.name} to cart`}
        onClick={() => {
          const { variantCount: _count, ...line } = product
          addItem({ ...line, quantity: 1, packageKey: DEFAULT_PACKAGE_KEY })
          void import("@/lib/telemetry").then(({ capture }) =>
            capture({ name: "product_added_to_cart", props: { productId: product.productId, quantity: 1 } }),
          )
        }}
        className="relative z-10 inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent"
      >
        <Plus aria-hidden="true" className="size-4" />
        Add
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label={`Quantity of ${product.name}`}
      className="relative z-10 inline-flex h-8 shrink-0 items-center overflow-hidden rounded-md bg-primary text-primary-foreground shadow-xs"
    >
      <button
        type="button"
        aria-label={quantity === 1 ? `Remove ${product.name} from cart` : `Decrease quantity of ${product.name}`}
        onClick={() =>
          quantity === 1 ? removeItem(product.variantId) : setItemQuantity(product.variantId, quantity - 1)
        }
        className="grid h-8 w-8 place-items-center hover:bg-white/15"
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <span aria-live="polite" className="min-w-6 text-center text-sm font-semibold tabular-nums">
        {quantity}
      </span>
      <button
        type="button"
        aria-label={`Increase quantity of ${product.name}`}
        disabled={quantity >= 99}
        onClick={() => setItemQuantity(product.variantId, quantity + 1)}
        className="grid h-8 w-8 place-items-center hover:bg-white/15 disabled:opacity-50"
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}
