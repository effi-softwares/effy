"use client"

import { Minus, Plus } from "lucide-react"

import { addItem, removeItem, setItemQuantity } from "@/lib/cart-actions"
import { DEFAULT_PACKAGE_KEY, useCart } from "@/lib/cart-store"

/**
 * The product card's Add control (reference: Shared components · Product card).
 *
 * "Add" becomes the quantity stepper IN PLACE the moment the product is in the cart, and goes back to
 * "Add" when its quantity returns to zero. The cart is the only state: the stepper shows the cart's
 * own quantity for this product, so the same product on two rails, the cart drawer and the cart page
 * can never disagree.
 *
 * ⚠ No toast here. On a card the control itself is the confirmation — it has just turned blue and
 * shows a number — and a rail of six cards would otherwise stack six toasts.
 */
export function CardAdd({
  product,
}: {
  product: {
    productId: string
    name: string
    imageUrl: string | null
    unitPriceAmount: string
    currency: string
  }
}) {
  const quantity = useCart().find((l) => l.productId === product.productId)?.quantity ?? 0

  if (quantity === 0) {
    return (
      <button
        type="button"
        aria-label={`Add ${product.name} to cart`}
        onClick={() => {
          addItem({ ...product, quantity: 1, packageKey: DEFAULT_PACKAGE_KEY })
          void import("@/lib/telemetry").then(({ capture }) =>
            capture({ name: "product_added_to_cart", props: { productId: product.productId, quantity: 1 } }),
          )
        }}
        className="relative z-10 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[13px] font-medium shadow-xs hover:bg-accent"
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
          quantity === 1 ? removeItem(product.productId) : setItemQuantity(product.productId, quantity - 1)
        }
        className="grid h-8 w-8 place-items-center hover:bg-white/15"
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <span aria-live="polite" className="min-w-6 text-center text-[13px] font-semibold tabular-nums">
        {quantity}
      </span>
      <button
        type="button"
        aria-label={`Increase quantity of ${product.name}`}
        disabled={quantity >= 99}
        onClick={() => setItemQuantity(product.productId, quantity + 1)}
        className="grid h-8 w-8 place-items-center hover:bg-white/15 disabled:opacity-50"
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}
