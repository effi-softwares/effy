import type { StorefrontProductCardDTO } from "@effy/shared-types"

import { ActionLink, CenteredHeading } from "@/components/storefront/kit"

import { ProductCard, productGrid } from "./ProductCard"
import { SaveControl } from "./SaveControl"

/**
 * A merchandising row, from the tech-store reference (025 UI refresh).
 *
 * The reference's pattern: a section header with the title on the LEFT and a "See all …" link on the
 * RIGHT, separated by a rule, then a DENSE row of up to six products. Stacking several of these is how
 * it puts a large catalogue on one page without it turning into a wall — each row is bounded by its
 * own header and rule.
 *
 * That density is the point. The previous design showed four large tiles per row; six compact ones
 * fit a grocery catalogue far better, where a shopper is comparing many similar items on price.
 */
export function ProductRail({
  title,
  products,
  href,
  className,
}: {
  title: string
  products: StorefrontProductCardDTO[]
  /** "View all" target. Omitted where no full listing exists (e.g. related items). */
  href?: string
  className?: string
}) {
  if (products.length === 0) return null

  return (
    <section className={`container py-12 sm:py-16 ${className ?? ""}`}>
      <CenteredHeading>{title}</CenteredHeading>

      {/* Columns and gutters come from `productGrid` so every listing on the storefront shares one
          rhythm — see the note on that constant. */}
      <div className={`mt-9 ${productGrid}`}>
        {products.slice(0, 8).map((p) => (
          <ProductCard key={p.id} product={p} saveControl={<SaveControl productId={p.id} />} />
        ))}
      </div>

      {href && (
        <div className="mt-10 flex justify-center">
          <ActionLink href={href} variant="outline" size="lg" className="min-w-[13rem]">
            View all
          </ActionLink>
        </div>
      )}
    </section>
  )
}
