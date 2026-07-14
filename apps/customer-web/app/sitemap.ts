import type { MetadataRoute } from "next"

import { siteUrl } from "@/lib/config"

/**
 * The machine-readable index of the storefront's public pages (FR-004).
 *
 * Only PUBLIC, indexable pages belong here. Account, checkout and the auth pages are excluded —
 * listing a page in the sitemap while `robots.txt` disallows it is a contradiction that search
 * consoles will (rightly) report as an error.
 *
 * ⚠ The catalog slice must SHARD this. A grocery catalog will exceed the 50,000-URL / 50 MB
 * limit for a single sitemap file, at which point this becomes a sitemap index plus per-category
 * children via `generateSitemaps()`. Note the Next 16 breaking change waiting there: the `id`
 * passed to `generateSitemaps` is now a `Promise<string>` and must be awaited.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()

  return [
    {
      url: `${base}/`,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${base}/browse`,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ]
}
