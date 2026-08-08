import { Suspense } from "react"
import Link from "next/link"

import { BrandMark } from "@/components/storefront/BrandMark"
import { pageSurface } from "@/components/storefront/kit"
import { UserIsland, UserIslandSkeleton } from "@/components/header/UserIsland"

import { HeaderSearch, HeaderSearchFallback } from "./_components/HeaderSearch"
import { MiniCart } from "./_components/MiniCart"
import { MobileNav, MobileNavFallback } from "./_components/MobileNav"
import { PrimaryNav, PrimaryNavFallback } from "./_components/PrimaryNav"
import { StorefrontFooter } from "./_components/StorefrontFooter"
import { ToastRegion } from "./_components/ToastRegion"

/**
 * The PUBLIC storefront shell.
 *
 * Everything here except the <Suspense> islands is static and prerenders into the shell that gets
 * served from cache. The islands are the request-time holes (research D4).
 *
 * ⚠ Do NOT call cookies() or headers() in this file. Do NOT import aws-amplify. Both are
 * machine-guarded, but the guard tells you that you broke a rule — not why it exists: either one
 * silently converts every public page from "served instantly from a cached static shell" to
 * "rendered from scratch on every request", which is the difference between the storefront this is
 * meant to be and a slow one.
 *
 * ── The chrome, after the shadcn navbar-01 pattern ─────────────────────────────────────────────
 *
 * An information bar, then ONE header row (operator direction, 2026-08-08):
 *
 *   info    shop-level announcement (dark, scrolls away)
 *   ═══════════════════════════════════════════════════════════════════════════════════
 *   ≥ lg    logo · primary nav          ·          search · cart · account
 *   ───────────────────────────────────────────────────────────────────────────────────
 *   < lg    logo                        ·          cart · menu
 *           full-width search (its own row, below the sticky header)
 *
 * ⚠ THE DESKTOP THRESHOLD IS `lg`, NOT `md`. Five things now share one row — mark, four
 * pipe-separated links, a search field, the cart and the account control — and at 768 px they do not
 * fit without the nav wrapping into the search box. Below `lg` the links and the account control move
 * into the drawer, which is what makes the single row possible at all: the merge is only safe because
 * the small-screen layout drops to two controls, not because the row got tighter.
 *
 * ⚠ `PrimaryNav` (`hidden lg:flex`) and `MobileNav` (`lg:hidden`) MUST keep the same breakpoint, or
 * the same four links are in the accessibility tree twice at some width.
 *
 * ⚠ NO blur and NO translucency — the header is opaque and shares the page surface.
 */
export default function ShopLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`flex min-h-svh flex-col ${pageSurface}`}>
      {/* ── The information bar ──────────────────────────────────────────────────────────────
          A slim dark strip above the header, carrying shop-level information. It is the detail that
          reads "real shop" rather than "landing page", and it costs one row of height.

          ⚠ Deliberately NOT sticky. It scrolls away while the header below it pins — an announcement
          is worth one read, and keeping it on screen forever would spend permanent vertical space on
          something nobody re-reads.

          Effy's copy states what is TRUE of the platform: delivery framing and the guest-first
          promise. No invented phone number, no invented opening hours. */}
      <div className="bg-foreground text-background">
        <div className="container flex h-9 items-center justify-between gap-4 text-xs">
          <span className="truncate">Fresh groceries and everyday essentials, delivered</span>
          <span className="hidden shrink-0 sm:inline">
            Browse without an account —{" "}
            <Link href="/sign-in" className="underline underline-offset-2 hover:no-underline">
              sign in
            </Link>{" "}
            only when you order
          </span>
        </div>
      </div>

      <header className={`sticky top-0 z-40 border-b ${pageSurface}`}>
        <div className="container flex h-16 items-center gap-4 lg:gap-6">
          {/* Identity, then the catalogue — the two things that answer "where am I and what is here". */}
          <BrandMark />
          <Suspense fallback={<PrimaryNavFallback />}>
            <PrimaryNav />
          </Suspense>

          {/* `ml-auto` rather than `justify-between`: the nav must sit BESIDE the mark, not spread away
              from it, so the row reads left-to-right as identity → catalogue → actions. */}
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* FR-011: a persistent search entry. Compact here so it does not crowd the row; the
                full-width field appears under the header on small screens.
                ⚠ Wrapped in <Suspense> because HeaderSearch reads useSearchParams(), which under
                cacheComponents is a dynamic read — outside a boundary it makes the whole route
                blocking, and the build fails rather than letting that happen. The fallback is the
                same control minus the value, so the shell still ships a usable box. */}
            <Suspense fallback={<HeaderSearchFallback className="hidden lg:block lg:w-60 xl:w-72" />}>
              <HeaderSearch className="hidden lg:block lg:w-60 xl:w-72" />
            </Suspense>

            <MiniCart />

            {/* DYNAMIC HOLE — reads cookies at request time and streams into this reserved slot
                while the rest of the page is already on screen.
                ⚠ Hidden below `lg`: on a phone the account control lives in the drawer instead, so
                the header carries only the cart and the menu. */}
            <div className="hidden lg:block">
              <Suspense fallback={<UserIslandSkeleton />}>
                <UserIsland />
              </Suspense>
            </div>

            {/* Below `lg` the pipe-separated nav is hidden and this drawer replaces it — carrying the
                same four links AND the account control. */}
            <Suspense fallback={<MobileNavFallback />}>
              <MobileNav
                account={
                  <Suspense fallback={<UserIslandSkeleton />}>
                    <UserIsland />
                  </Suspense>
                }
              />
            </Suspense>
          </div>
        </div>
      </header>

      {/* The full-width search field, on the viewports where the single header row has no room for it.
          ⚠ Deliberately OUTSIDE the sticky <header>: it is a second row on a phone, and pinning both
          would spend a quarter of a small viewport on chrome that is only needed once per visit. */}
      <div className="border-b lg:hidden">
        <div className="container py-4">
          <Suspense fallback={<HeaderSearchFallback size="lg" />}>
            <HeaderSearch size="lg" />
          </Suspense>
        </div>
      </div>

      <main className="flex-1">{children}</main>

      {/* Transient feedback for adds, removals and failures (025 US4). */}
      <ToastRegion />

      <StorefrontFooter />
    </div>
  )
}
