import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Cache Components (research D3). This single flag replaces Next 15's experimental
  // `dynamicIO` / `ppr` / `useCache` and INVERTS the default: everything is dynamic
  // unless explicitly cached, and uncached data read outside a <Suspense> boundary is a
  // BUILD ERROR, not a silent production regression.
  //
  // That build error is the point. It is what makes FR-005/FR-007 ("public pages MUST be
  // cacheable") a compile-time gate rather than something we discover from a Lighthouse
  // score three months from now. Do not disable it to make a page compile — the page is
  // telling you it just went dynamic.
  cacheComponents: true,

  // The shared packages ship raw TypeScript (no build step), so Next compiles them itself.
  transpilePackages: [
    "@effy/design-system",
    "@effy/shared-types",
    "@effy/api-client",
    "@effy/legal-content",
  ],

  experimental: {
    // Rewrites barrel imports to deep imports, so one `import { X } from "@effy/..."`
    // does not drag a package's whole module graph into a client chunk. Next optimizes
    // `lucide-react` out of the box; our own packages it does not know about.
    optimizePackageImports: [
      "@effy/design-system",
      "@effy/shared-types",
      "@effy/api-client",
    ],
  },

  images: {
    // AVIF first — materially smaller than WebP for product photography.
    formats: ["image/avif", "image/webp"],
    // `images.domains` is deprecated in Next 16; remotePatterns replaces it.
    // 019: product images are PRESIGNED, expiring S3 GET URLs (research R7) — rendered
    // `unoptimized` (the optimizer cannot cache a signed URL). The private product-media
    // bucket is virtual-hosted under *.amazonaws.com. A CDN-backed optimized path is a later slice.
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com", pathname: "/**" },
    ],
  },

  // Don't advertise the framework to the entire internet.
  poweredByHeader: false,

  // `/browse` (the standalone category index) was retired by operator decision — the storefront
  // now has ONE catalogue page, `/search` ("All products"), which category tiles already funnel
  // into via `?category=`. This permanent redirect keeps any indexed or externally-linked
  // `/browse` URL alive instead of 404-ing it, and tells search engines the page moved.
  async redirects() {
    return [{ source: "/browse", destination: "/search", permanent: true }]
  },

  // 050 FR-028 — first-party reverse proxy for PostHog. Analytics + error tracking send to `/rc/*` on
  // our own origin (see lib/config.ts `ingestPath`), which Next rewrites to the PostHog host, so
  // tracking blockers can't drop the calls and no third-party host appears in the network tab. The
  // host is region config (us | eu), never a literal — matching NEXT_PUBLIC_POSTHOG_HOST.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com"
    const assets = host.replace(/^https:\/\/(us|eu)\./, "https://$1-assets.")
    return [
      { source: "/rc/static/:path*", destination: `${assets}/static/:path*` },
      { source: "/rc/:path*", destination: `${host}/:path*` },
    ]
  },
}

export default nextConfig
