import type { Metadata } from "next"
import { Suspense } from "react"

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
    <Suspense>
      <SearchExperience />
    </Suspense>
  )
}
