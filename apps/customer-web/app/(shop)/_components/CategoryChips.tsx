import Link from "next/link"

import type { StorefrontCategoryDTO } from "@effy/shared-types"

/**
 * Browsable category chips. Each links to search filtered by that category — the facet is a QUERY
 * PARAM (never a path segment), so discovery pages stay cacheable/crawlable (FR-017).
 */
export function CategoryChips({ categories }: { categories: StorefrontCategoryDTO[] }) {
  if (categories.length === 0) return null
  return (
    <nav aria-label="Categories" className="flex gap-2 overflow-x-auto px-4 py-3 sm:px-6">
      {categories.map((c) => (
        <Link
          key={c.key}
          href={`/search?category=${encodeURIComponent(c.key)}`}
          className="shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium hover:bg-accent"
        >
          {c.name}
        </Link>
      ))}
    </nav>
  )
}
