import type { Metadata } from "next"
import { Suspense } from "react"

import { getCategoriesSafe } from "@/lib/categories"

import { SearchExperience } from "../_components/SearchExperience"

export const metadata: Metadata = {
  title: "Search · Effy",
  description: "Search groceries and everyday essentials at Effy.",
  alternates: { canonical: "/search" },
}

/**
 * Search (US4). The results are personalized-per-query and load client-side (infinite scroll), so the
 * page is a thin static shell around the client experience, which reads the query from the URL. Facets
 * are query params (Disallowed in robots.ts) so the canonical /search stays cacheable/crawlable.
 */
export default function SearchPage() {
  return (
    // The tree is the read the header already makes for this request, so naming the aisle costs
    // nothing extra; if it cannot be read the page still works and simply cannot name one.
    <Suspense>
      <NamedSearch />
    </Suspense>
  )
}

/** The search view, given the category tree so it can name the aisle it is showing. */
async function NamedSearch() {
  const categories = (await getCategoriesSafe()).map((c) => ({ key: c.key, name: c.name, parentKey: c.parentKey }))
  return <SearchExperience categories={categories} />
}
