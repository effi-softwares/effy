import type { Metadata } from "next"
import { Suspense } from "react"

import type { StorefrontCategoryDTO } from "@effy/shared-types"

import { coreApi, uncached } from "@/lib/api/core"
import { siteUrl } from "@/lib/config"
import { JsonLd, breadcrumbLd } from "@/lib/json-ld"

import { EmptyState, PageHeader } from "@/components/storefront/kit"

import { CategoryTile } from "../_components/CategoryTile"

export const metadata: Metadata = {
  title: "Browse",
  description:
    "Browse groceries and everyday essentials at Effy by category. No account needed — sign in only when you order.",
  alternates: { canonical: "/browse" },
  openGraph: { title: "Browse · Effy", url: "/browse" },
}

/**
 * The category index (025 US1 / FR-009).
 *
 * ⚠ This page used to be a placeholder reading "the shelves are still being stocked" — and it was the
 * ONLY entry in the storefront's primary navigation, so the single most prominent link on a store with
 * a real catalogue led to a dead end. That was true from 011 (when there genuinely were no products)
 * and stayed true through 016 and 019, which filled the catalogue but never came back for this page.
 *
 * The shell (heading, breadcrumb, metadata) prerenders; the tree streams inside <Suspense>, exactly
 * like Home. Entering a category goes to the existing filtered result set, keeping facets as query
 * params so the crawl and cache policy is unchanged (FR-017).
 */
export default function BrowsePage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd(siteUrl(), [
          { name: "Home", path: "/" },
          { name: "Browse", path: "/browse" },
        ])}
      />

      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <PageHeader
          title="Browse the store"
          description="Every category, no account required."
        />

        <Suspense fallback={<BrowseSkeleton />}>
          <CategoryTree />
        </Suspense>
      </section>
    </>
  )
}

async function CategoryTree() {
  let categories: StorefrontCategoryDTO[]
  try {
    categories = await coreApi().get<StorefrontCategoryDTO[]>("/v1/storefront/categories", uncached())
  } catch {
    return <BrowseUnavailable />
  }

  // Only categories with something in them — an empty category in a browse grid is a promise the store
  // cannot keep. (Entering one that empties later still lands on an explained empty state.)
  const stocked = categories.filter((c) => c.productCount > 0)
  if (stocked.length === 0) return <EmptyStore />

  const roots = stocked.filter((c) => c.parentKey === null)
  const childrenOf = (key: string) => stocked.filter((c) => c.parentKey === key)

  // A flat taxonomy (no parents) is a legitimate shape, not an error — render one grid.
  const groups = roots.length > 0 ? roots : []
  if (groups.length === 0) {
    return (
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
        {stocked.map((c) => (
          <CategoryTile key={c.key} category={c} />
        ))}
      </div>
    )
  }

  return (
    <div className="mt-8 space-y-10">
      {groups.map((root) => {
        const children = childrenOf(root.key)
        return (
          <section key={root.key}>
            <h2 className="mb-4 text-xl font-bold tracking-tight">{root.name}</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
              {/* A top-level category with no children is itself browsable. */}
              {(children.length > 0 ? children : [root]).map((c) => (
                <CategoryTile key={c.key} category={c} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function BrowseSkeleton() {
  return (
    <div className="mt-8 space-y-10" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row}>
          <div className="mb-3 h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyStore() {
  return (
    <EmptyState
      className="mt-10"
      title="The shelves are still being stocked"
      description="Our catalogue is on its way. Check back soon."
      action={{ label: "Search instead", href: "/search" }}
    />
  )
}

function BrowseUnavailable() {
  return (
    <EmptyState
      className="mt-10"
      title="We couldn’t load the categories just now"
      description="Please try again in a moment — or search for what you need from the header."
      action={{ label: "Go to search", href: "/search" }}
    />
  )
}
