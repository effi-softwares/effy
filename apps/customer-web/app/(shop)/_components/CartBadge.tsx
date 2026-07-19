"use client"

import { ShoppingCart } from "lucide-react"
import Link from "next/link"

import { useCartCount } from "@/lib/cart-store"

/** Header cart indicator (US2). Reads the reactive guest-cart count; links to the cart (US3). */
export function CartBadge() {
  const count = useCartCount()
  return (
    <Link
      href="/cart"
      className="relative inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
      aria-label={count > 0 ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart, empty"}
    >
      <ShoppingCart className="size-5" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  )
}
