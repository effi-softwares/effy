import type { StorefrontProductCardDTO } from "@effy/shared-types"

import { ProductCard } from "./ProductCard"

/**
 * A horizontally scrolling rail of product cards (Featured / On sale / a category). Native overflow
 * scroll — no JS, stays in the static shell. Snap points give it a native feel.
 */
export function ProductRail({
  title,
  products,
}: {
  title: string
  products: StorefrontProductCardDTO[]
}) {
  if (products.length === 0) return null
  return (
    <section className="py-4">
      <h2 className="mb-3 px-4 text-lg font-semibold tracking-tight sm:px-6">{title}</h2>
      <div className="flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:px-6 [scrollbar-width:thin]">
        {products.map((p) => (
          <div key={p.id} className="snap-start">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  )
}
