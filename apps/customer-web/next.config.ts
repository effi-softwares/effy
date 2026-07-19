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
}

export default nextConfig
