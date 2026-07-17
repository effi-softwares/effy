import { Suspense } from "react"
import Link from "next/link"

import { UserIsland, UserIslandSkeleton } from "@/components/header/UserIsland"
import { AppearanceControl } from "@/components/theme/AppearanceControl"

/**
 * The PUBLIC storefront shell.
 *
 * Everything here except the <Suspense> island is static and prerenders into the shell that
 * gets served from cache. The island is the single request-time hole (research D4).
 *
 * ⚠ Do NOT call cookies() or headers() in this file. Do NOT import aws-amplify. Both are
 * machine-guarded, but the guard tells you that you broke a rule — not why it exists:
 * either one silently converts every public page from "served instantly from a cached static
 * shell" to "rendered from scratch on every request", which is the difference between the
 * storefront this is meant to be and a slow one.
 */
export default function ShopLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4 sm:px-6">
          {/* Static: the brand mark. In the shell. */}
          <Link href="/" className="flex items-center gap-2" aria-label="Effy home">
            <span className="inline-block size-6 rounded-md bg-primary" aria-hidden="true" />
            <span className="text-lg font-semibold tracking-tight">Effy</span>
          </Link>

          {/* Static: primary navigation. In the shell. */}
          <nav aria-label="Primary" className="hidden gap-4 sm:flex">
            <Link
              href="/browse"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Browse
            </Link>
          </nav>

          <div className="flex-1" />

          {/* Static client island: appearance switcher (017). No cookies, no SDK — stays in the shell. */}
          <AppearanceControl className="mr-1" />

          {/* DYNAMIC HOLE — and the only one. Reads cookies at request time and streams into
              this reserved slot while the rest of the page is already on screen. */}
          <Suspense fallback={<UserIslandSkeleton />}>
            <UserIsland />
          </Suspense>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* No `new Date()` here. Under `cacheComponents` a non-deterministic call during
          prerender is a dynamic API — a live copyright year would quietly cost this layout its
          static shell, on every page, to render a number nobody reads. */}
      <footer className="border-t py-8">
        <div className="mx-auto w-full max-w-7xl px-4 text-sm text-muted-foreground sm:px-6">
          © Effy
        </div>
      </footer>
    </div>
  )
}
