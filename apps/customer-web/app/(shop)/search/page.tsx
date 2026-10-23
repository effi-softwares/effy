import type { Metadata } from "next"
import { Suspense } from "react"

import type { FacetSetDTO, ProductSearchResultDTO } from "@effy/shared-types"

import { edgeApiPublic, uncached } from "@/lib/api/edge"
import { getCategoriesSafe } from "@/lib/categories"
import { facetsQuery, productsQuery, readRefinement, type SearchInitial } from "@/lib/search-query"

import { ProductGridSkeleton, productGridNarrow } from "../_components/ProductCard"
import { SearchExperience } from "../_components/SearchExperience"

export const metadata: Metadata = {
  title: "Search",
  description: "Search groceries and everyday essentials at Effy.",
  alternates: { canonical: "/search" },
}

type Search = Promise<Record<string, string | string[] | undefined>>

/**
 * Search and the aisle pages.
 *
 * The shell is static; inside the boundary the server reads the first page and its filter counts for
 * the address it was asked for, so the page arrives with its products in it — an aisle is the main
 * listing a shopper lands on. From there the browser refines and pages by itself (`SearchExperience`).
 *
 * Read live (`uncached`), like every listing. Facet params stay Disallowed in
 * robots.ts.
 */
export default function SearchPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <NamedSearch searchParams={searchParams} />
    </Suspense>
  )
}

/** The search view, given its first page and the category tree so it can name the aisle it is showing. */
async function NamedSearch({ searchParams }: { searchParams: Search }) {
  // The tree is the read the header already makes for this request, so naming the aisle costs
  // nothing extra; if it cannot be read the page still works and simply cannot name one.
  const [categories, initial] = await Promise.all([getCategoriesSafe(), firstPage(await searchParams)])
  return (
    <SearchExperience
      categories={categories.map((c) => ({ key: c.key, name: c.name, parentKey: c.parentKey }))}
      initial={initial}
    />
  )
}

/**
 * A failed read is not an error here: the page renders without a first page and the browser asks
 * for it itself — which is where "we couldn't load results" and its Try again already live.
 */
async function firstPage(search: Awaited<Search>): Promise<SearchInitial | null> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    for (const v of Array.isArray(value) ? value : [value]) if (v !== undefined) params.append(key, v)
  }
  const refinement = readRefinement(params)
  const query = productsQuery(refinement)
  const api = edgeApiPublic()
  try {
    const [result, facets] = await Promise.all([
      api.get<ProductSearchResultDTO>(`/storefront/v1/products?${query}`, uncached()),
      api.get<FacetSetDTO>(`/storefront/v1/facets?${facetsQuery(refinement)}`, uncached()).catch(() => null),
    ])
    return { query, at: Date.now(), result, facets }
  } catch {
    return null
  }
}

/** The page before its results: the heading's place, the filter rail's, and the grid's own tiles. */
function SearchSkeleton() {
  return (
    <div className="container py-6" aria-hidden="true">
      <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
      <div className="mt-6 h-8 w-56 animate-pulse rounded-md bg-muted" />
      <div className="mt-1 h-5" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <div className="hidden h-80 animate-pulse rounded-lg bg-muted lg:block" />
        <div className="min-w-0">
          <div className="h-10 lg:h-9" />
          <ProductGridSkeleton className={`mt-6 ${productGridNarrow}`} />
        </div>
      </div>
    </div>
  )
}
