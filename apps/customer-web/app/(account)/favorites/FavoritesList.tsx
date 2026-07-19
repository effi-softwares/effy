"use client"

import Image from "next/image"
import Link from "next/link"
import { useState } from "react"

import type { FavoriteDTO } from "@effy/shared-types"

import { addToCart } from "@/lib/cart-store"
import { formatMoney } from "@/lib/money"

/** Client favourites list (US6): open, add-to-cart, or remove. Remove hits the authenticated proxy. */
export function FavoritesList({ initial }: { initial: FavoriteDTO[] }) {
  const [items, setItems] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)

  async function remove(productId: string) {
    setBusy(productId)
    try {
      const res = await fetch(`/api/favorites/${productId}`, { method: "DELETE" })
      if (res.ok) setItems((prev) => prev.filter((f) => f.id !== productId))
    } finally {
      setBusy(null)
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">You haven’t saved anything yet.</p>
        <Link href="/" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          Browse the store
        </Link>
      </div>
    )
  }

  return (
    <ul className="divide-y rounded-lg border">
      {items.map((f) => (
        <li key={f.id} className="flex gap-4 p-4">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
            {f.imageUrl ? (
              <Image src={f.imageUrl} alt={f.name} fill unoptimized sizes="4rem" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">—</div>
            )}
          </div>
          <div className="flex flex-1 flex-col">
            <Link href={`/product/${f.id}`} className="text-sm font-medium hover:underline">
              {f.name}
            </Link>
            <span className="text-sm text-muted-foreground">{formatMoney(f.priceAmount, f.currency)}</span>
            <div className="mt-2 flex gap-3 text-sm">
              <button
                type="button"
                disabled={!f.available}
                onClick={() =>
                  addToCart({
                    productId: f.id,
                    name: f.name,
                    imageUrl: f.imageUrl,
                    unitPriceAmount: f.priceAmount,
                    currency: f.currency,
                    quantity: 1,
                  })
                }
                className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
              >
                {f.available ? "Add to cart" : "Unavailable"}
              </button>
              <button
                type="button"
                disabled={busy === f.id}
                onClick={() => remove(f.id)}
                className="text-muted-foreground hover:text-foreground"
              >
                Remove
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
