import Link from "next/link"
import { Suspense } from "react"
import { Search } from "lucide-react"
import type { ProductSearchResultDTO } from "@effy/shared-types"

import { CategoryStrip } from "@/app/(shop)/_components/CategoryStrip"
import { ProductRail } from "@/app/(shop)/_components/ProductRail"
import { StorefrontChrome } from "@/app/(shop)/_components/StorefrontChrome"
import { btnClass } from "@/components/storefront/actions"
import { input } from "@/components/storefront/kit"
import { edgeApiPublic, uncached } from "@/lib/api/edge"
import { getCategoriesSafe, topLevel } from "@/lib/categories"
import { cn } from "@/lib/utils"

/**
 * A page that is not there (reference: Help & info · 404).
 *
 * Never a dead end. Whoever lands here was looking for something: the page says so plainly and
 * then offers the three ways on - a search, the aisles, and what is on sale - inside the ordinary
 * storefront, with the header and cart they already had.
 *
 * The search is a plain GET form, so it works before any script has loaded.
 */
export default function NotFound() {
  return (
    <StorefrontChrome search>
      <div className="container py-10">
        <div className="mx-auto max-w-140 space-y-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">404</p>
          <h1 className="text-4xl font-semibold tracking-tight">We can&apos;t find that page</h1>
          <p className="text-base text-muted-foreground">
            It may have moved, or the link might be wrong. Try a search, or pick an aisle.
          </p>
          <form action="/search" role="search" className="flex gap-2 pt-2">
            <div className="relative flex-1">
              <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input type="search" name="q" placeholder="Search Effy" aria-label="Search" className={cn(input, "pl-9")} />
            </div>
            <button type="submit" className={btnClass("primary", "md", "max-md:h-10")}>
              Search
            </button>
          </form>
          <Link href="/" className={btnClass("link", "md")}>
            Go to the home page
          </Link>
        </div>
      </div>
      {/* Both are extras: if either cannot be read, the page above still stands on its own. */}
      <Suspense>
        <Aisles />
      </Suspense>
      <Suspense>
        <OnSale />
      </Suspense>
    </StorefrontChrome>
  )
}

async function Aisles() {
  const aisles = topLevel(await getCategoriesSafe())
  return aisles.length > 0 ? <CategoryStrip categories={aisles} /> : null
}

async function OnSale() {
  try {
    const sale = await edgeApiPublic().get<ProductSearchResultDTO>("/storefront/v1/products?saleOnly=true&limit=12", uncached())
    return <ProductRail title="On sale now" products={sale.items} href="/search?saleOnly=true" />
  } catch {
    return null
  }
}
