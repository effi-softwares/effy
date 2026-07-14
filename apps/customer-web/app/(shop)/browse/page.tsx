import type { Metadata } from "next"

import { JsonLd, breadcrumbLd } from "@/lib/json-ld"
import { siteUrl } from "@/lib/config"

export const metadata: Metadata = {
  title: "Browse",
  description:
    "Browse groceries and everyday essentials at Effy. No account needed — sign in only when you order.",
  alternates: { canonical: "/browse" },
  openGraph: { title: "Browse · Effy", url: "/browse" },
}

/**
 * The catalog placeholder.
 *
 * ⚠ THERE IS NO PRODUCT DATA IN THIS SLICE — by operator decision (2026-07-14). No catalog, no
 * cart, no checkout, no payment. `core-api` stays local-Docker-only and has no product tables.
 *
 * So this page is deliberately honest about being empty rather than faking product tiles. It
 * exists to prove the things that CAN be proven now and that the catalog slice will inherit:
 * the render mode (a cached static shell), the guest-first rule (no sign-in wall), the metadata
 * and crawl policy, and the bundle budget. The catalog slice fills the grid in and re-proves
 * SC-002/SC-004 against real product pages.
 *
 * When it does, the rules it must obey are already written down: facets are query parameters
 * (never path segments) and each is Disallow-ed in robots.txt; the page body is `use cache` +
 * cacheTag('category:<slug>'); price is tag-invalidated and stock is never cached.
 * See contracts/storefront-routes.contract.md.
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

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Browse the store</h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          You are browsing as a guest — no account required. We will only ask who you are when
          you place an order.
        </p>

        <div className="mt-10 rounded-lg border border-dashed p-12 text-center">
          <h2 className="text-lg font-medium">The shelves are still being stocked</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Our catalogue is on its way. This page is ready for it — it renders on the server,
            it is indexable, and it costs a guest nothing to load.
          </p>
        </div>
      </section>
    </>
  )
}
