import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Cache Components: everything is dynamic unless cached, and an uncached read outside <Suspense> is a
  // build error. That error keeps public pages cacheable; do not disable it to make a page compile.
  cacheComponents: true,

  // The shared packages ship raw TypeScript (no build step), so Next compiles them itself.
  transpilePackages: [
    "@effy/design-system",
    "@effy/shared-types",
    "@effy/api-client",
    // Only its `/live` entry point is imported (the framework-free channel client). The package
    // root pulls in the auth SDK and must never be imported here; `LiveRefresh.test.tsx` holds that.
    "@effy/web-kit",
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
    // No page uses `next/image` any more: catalogue and promotion pictures come from the media
    // CDN through `CatalogImage` (a plain <picture> offering the WebP copies the worker made at
    // upload), so nothing here is optimised and no remote host needs allowing. The S3 wildcard that
    // let presigned links through is gone with them. If `next/image` is ever reintroduced for a
    // remote picture, name its host here - never a wildcard.
    remotePatterns: [],
  },

  // Don't advertise the framework to the entire internet.
  poweredByHeader: false,

  // `/browse` (the standalone category index) was retired by operator decision - the storefront
  // now has one catalogue page, `/search` ("All products"), which category tiles already funnel
  // into via `?category=`. This permanent redirect keeps any indexed or externally-linked
  // `/browse` URL alive instead of 404-ing it, and tells search engines the page moved.
  async redirects() {
    return [
      { source: "/browse", destination: "/search", permanent: true },
      // The message form moved under the help answers. The query (`?from=checkout`) rides along.
      { source: "/feedback", destination: "/help", permanent: true },
    ]
  },

  // First-party reverse proxy for PostHog. Analytics + error tracking send to `/rc/*` on
  // our own origin (see lib/config.ts `ingestPath`), which Next rewrites to the PostHog host, so
  // tracking blockers can't drop the calls and no third-party host appears in the network tab. The
  // host is region config (us | eu), never a literal - matching NEXT_PUBLIC_POSTHOG_HOST.
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
