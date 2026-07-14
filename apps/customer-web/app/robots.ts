import type { MetadataRoute } from "next"

import { siteUrl } from "@/lib/config"

/**
 * Crawl directives (FR-004), per contracts/storefront-routes.contract.md.
 *
 * The storefront WANTS to be crawled — that is the point of building it server-rendered. What
 * we disallow is everything that is per-customer or transactional: those pages are useless in a
 * search index, and crawling them burns crawl budget that should be spent on products.
 *
 * ⚠ Inherited by the catalog slice, and non-negotiable there: FACET PARAMETERS GET DISALLOWED
 * HERE. Faceted navigation is, per Google, "by far the most common source of overcrawl issues"
 * — a category with 8 filters generates combinatorially many URLs of near-identical content.
 * `noindex` does NOT fix that: Google still fetches the page and only then drops it, so the
 * crawl budget is spent either way. Only a robots.txt `Disallow` prevents the fetch.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/checkout",
        "/sign-in",
        "/sign-up",
        "/callback",
        "/api/",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
