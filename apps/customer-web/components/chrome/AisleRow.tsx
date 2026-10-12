import { Suspense } from "react"
import Link from "next/link"
import { ChevronRight, LayoutGrid, Tag } from "lucide-react"

import { AccountMenuAutoClose } from "@/components/header/AccountMenuAutoClose"
import { Separator } from "@/components/ui/misc"
import { aisleHref, childrenOf, getCategoriesSafe, topLevel } from "@/lib/categories"

import { AisleLink, AisleLinkFallback } from "./AisleLink"
import { aisleIcon } from "./aisle-icon"

const SALE_HREF = "/search?saleOnly=true"

/**
 * The aisle row under the masthead: All aisles, Deals, then every top-level aisle on ONE line.
 *
 * ⚠ It never wraps. More aisles than fit scroll sideways (no scrollbar), and every one of them is
 * also in the All aisles menu — so nothing is reachable only by scrolling.
 *
 * The All aisles menu is a `<details>`, closed by the same tiny listener the account menu uses
 * (outside press, Escape, following a link). No overlay library is loaded for it.
 */
export async function AisleRow() {
  const categories = await getCategoriesSafe()
  const aisles = topLevel(categories)

  return (
    <nav aria-label="Aisles" className="relative flex h-12 items-center gap-1">
      {aisles.length > 0 && (
        <details className="group shrink-0" data-menu="aisles">
          <AccountMenuAutoClose />
          <summary className="inline-flex h-8 list-none items-center gap-2 rounded-md border border-input pr-3 pl-2.5 text-sm font-medium whitespace-nowrap shadow-xs hover:bg-accent group-open:bg-accent [&::-webkit-details-marker]:hidden">
            <LayoutGrid aria-hidden="true" className="size-4 text-muted-foreground" />
            All aisles
          </summary>
          <div className="absolute top-full left-0 z-50 mt-1 max-h-[70vh] w-full overflow-y-auto rounded-lg border bg-popover p-6 shadow-md">
            <ul className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {aisles.map((aisle) => {
                const Icon = aisleIcon(aisle.name)
                const subs = childrenOf(categories, aisle.key)
                return (
                  <li key={aisle.key}>
                    <Link
                      href={aisleHref(aisle.key)}
                      className="flex items-center gap-2 text-sm font-semibold hover:underline"
                    >
                      <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                      {aisle.name}
                    </Link>
                    {subs.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {subs.map((sub) => (
                          <li key={sub.key}>
                            <Link
                              href={aisleHref(sub.key)}
                              className="text-sm text-muted-foreground hover:text-foreground"
                            >
                              {sub.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-4 text-sm">
              <Link href="/search" className="inline-flex items-center gap-1 font-medium text-primary">
                All products
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href={SALE_HREF} className="inline-flex items-center gap-1 font-medium text-brand">
                On sale
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href="/offers" className="inline-flex items-center gap-1 font-medium text-primary">
                Offers
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        </details>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Suspense
          fallback={
            <AisleLinkFallback href={SALE_HREF} className="text-brand [&_svg]:text-brand">
              <Tag aria-hidden="true" />
              Deals
            </AisleLinkFallback>
          }
        >
          <AisleLink href={SALE_HREF} match={{ sale: true }} className="text-brand [&_svg]:text-brand">
            <Tag aria-hidden="true" />
            Deals
          </AisleLink>
        </Suspense>
        {aisles.length > 0 && <Separator orientation="vertical" className="mx-1" />}
        {aisles.map((aisle) => {
          const Icon = aisleIcon(aisle.name)
          const inner = (
            <>
              <Icon aria-hidden="true" />
              {aisle.name}
            </>
          )
          return (
            <Suspense
              key={aisle.key}
              fallback={<AisleLinkFallback href={aisleHref(aisle.key)}>{inner}</AisleLinkFallback>}
            >
              <AisleLink href={aisleHref(aisle.key)} match={{ category: aisle.key }}>
                {inner}
              </AisleLink>
            </Suspense>
          )
        })}
      </div>
    </nav>
  )
}

/** The row before the aisle list arrives: the two fixed entries, at the row's real height. */
export function AisleRowFallback() {
  return (
    <nav aria-label="Aisles" className="flex h-12 items-center gap-1">
      <AisleLinkFallback href="/search" className="border border-input shadow-xs">
        <LayoutGrid aria-hidden="true" />
        All aisles
      </AisleLinkFallback>
      <AisleLinkFallback href={SALE_HREF} className="text-brand [&_svg]:text-brand">
        <Tag aria-hidden="true" />
        Deals
      </AisleLinkFallback>
    </nav>
  )
}
