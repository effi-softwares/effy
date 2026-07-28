import type { StorefrontProductCardDTO } from "@effy/shared-types"

import { ActionLink, CenteredHeading } from "@/components/storefront/kit"

import { ProductCard } from "./ProductCard"

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
    <section className={`mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 ${className ?? ""}`}>
      <CenteredHeading>{title}</CenteredHeading>

      {/* Wide tiles: 2-up on a phone, 4 across at desktop. The tile is the merchandising unit —
          at 6-up a grocery photograph is a thumbnail (operator's card spec). `items-stretch`
          plus `h-full` inside the card is what keeps every price row on one baseline. */}
      <div className="mt-9 grid grid-cols-2 items-stretch gap-x-4 gap-y-9 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
        {products.slice(0, 8).map((p) => (
          <ProductCard key={p.id} product={p} />
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
