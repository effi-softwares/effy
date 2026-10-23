import type { MetadataRoute } from "next"

import { siteUrl } from "@/lib/config"

/**
 * The index of the storefront's public pages (account, checkout and auth are excluded, as robots.txt
 * disallows them). A large catalogue will need a sitemap index via `generateSitemaps` (its `id` is a
 * `Promise<string>` in Next 16).
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
      url: `${base}/search`,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ]
}
