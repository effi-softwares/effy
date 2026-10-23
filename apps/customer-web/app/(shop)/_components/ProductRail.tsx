import type { StorefrontProductCardDTO } from "@effy/shared-types"

import { SectionHeader, sectionSpacing } from "@/components/storefront/kit"

import { FIRST_ROW, ProductCard } from "./ProductCard"
import { SaveControl } from "./SaveControl"

/**
 * A merchandising row: a header with the title and a "See all …" link, a rule, then up to six compact
 * products, so a large catalogue fits on one page without becoming a wall.
 */
/** How many cards a rail shows before "See all" takes over. Two desktop screens' worth. */
export const RAIL_CAP = 12

/**
 * One merchandised row (reference: Home · "Today's deals", aisle rails, "New arrivals").
 *
 * A heading with its "See all" link on the right, then one line of cards that scrolls sideways: 2.2
 * cards on a phone (the cut-off third card is what says "there is more"), 4 from `md`, 6 from `xl`.
 *
 * CSS scroll-snap, no script and no arrow buttons: a rail is content, and it must work in the
 * static shell. Keyboard users reach every card by tabbing; the list itself is focusable so the row
 * can be scrolled with the arrow keys.
 */
export function ProductRail({
  title,
  products,
  href,
  linkLabel = "See all",
  priority = false,
  className,
}: {
  title: string
  products: StorefrontProductCardDTO[]
  href?: string
  linkLabel?: string
  /** The first rail on a page — its opening cards load their pictures eagerly. One rail per page. */
  priority?: boolean
  className?: string
}) {
  if (products.length === 0) return null
  return (
    <section className={`container ${sectionSpacing} ${className ?? ""}`}>
      <SectionHeader title={title} href={href} linkLabel={linkLabel} />
      <ul
        tabIndex={0}
        aria-label={title}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {products.slice(0, RAIL_CAP).map((p, i) => (
          <li
            key={p.id}
            className="w-[calc((100%-2rem)/2.2)] shrink-0 snap-start md:w-[calc((100%-3rem)/4)] xl:w-[calc((100%-5rem)/6)]"
          >
            <ProductCard
              product={p}
              saveControl={<SaveControl productId={p.id} />}
              priority={priority && i < FIRST_ROW}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
