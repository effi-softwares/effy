import { Suspense } from "react"
import Link from "next/link"

import { BrandMark } from "@/components/storefront/BrandMark"
import { pageSurface } from "@/components/storefront/kit"
import { UserIsland, UserIslandSkeleton } from "@/components/header/UserIsland"

import { DeliverySeed, DeliverySeedFallback } from "./_components/DeliverySeed"
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
 * ── The chrome, after the shadcn navbar-03 pattern ─────────────────────────────────────────────
 *
 * An information bar, then a header of TWO ROWS divided by a hairline:
 *
 *   info    shop-level announcement (dark, scrolls away)
 *   ═══════════════════════════════════════════════════════════════════════════════════
 *   row 1   delivery location (left)                ·   search + cart + account (right)
 *   ───────────────────────────────────────────────────────────────────────────────────
 *   row 2   logo + wordmark (left)                  ·   primary nav, pipe-separated (right)
 *
 * The split is what makes it read as a store rather than an app bar: the top row is *about the shop*
 * (where it delivers, who you are, what's in your basket) and the bottom row is *about the catalogue*.
 * Mixing the two into one row is what the previous header did, and it is why the logo, nav, search and
 * five icons were all competing for the same horizontal space.
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
        <div className="mx-auto flex h-9 w-full max-w-7xl items-center justify-between gap-4 px-4 text-xs sm:px-6">
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
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          {/* ── Row 1: utility + actions ───────────────────────────────────────────────────── */}
          <div className="flex h-16 items-center gap-4 border-b">
            {/* FR-012: the delivery location. It lives here rather than beside the cart because
                "do you deliver to me" is shop information, not a shopping action — the same slot the
                reference gives to its utility links. */}
            {/* ⚠ DYNAMIC HOLE. `DeliverySeed` reads the session + default address at request time so a
                signed-in shopper is never asked where they live (030 FR-018). It MUST stay inside this
                <Suspense> — and this file must never read cookies itself, or every public page stops
                prerendering into a static shell. The fallback is the same affordance without a seed,
                so the shell ships immediately and nothing shifts. */}
            <Suspense fallback={<DeliverySeedFallback />}>
              <DeliverySeed />
            </Suspense>

            <div className="flex-1" />

            {/* FR-011: a persistent search entry. Compact here so it does not crowd the row; the
                full-width field appears under the header on small screens.
                ⚠ Wrapped in <Suspense> because HeaderSearch reads useSearchParams(), which under
                cacheComponents is a dynamic read — outside a boundary it makes the whole route
                blocking, and the build fails rather than letting that happen. The fallback is the
                same control minus the value, so the shell still ships a usable box. */}
            <Suspense fallback={<HeaderSearchFallback className="hidden w-64 lg:block" />}>
              <HeaderSearch className="hidden w-64 lg:block" />
            </Suspense>

            <div className="flex items-center gap-3">
              <MiniCart />
              {/* DYNAMIC HOLE — reads cookies at request time and streams into this reserved slot
                  while the rest of the page is already on screen.
                  ⚠ Hidden below `md`: on a phone the account control lives in the drawer instead, so
                  the header carries only the cart. */}
              <div className="hidden md:block">
                <Suspense fallback={<UserIslandSkeleton />}>
                  <UserIsland />
                </Suspense>
              </div>
            </div>
          </div>

          {/* ── Row 2: identity + catalogue nav ────────────────────────────────────────────── */}
          <div className="flex h-16 items-center justify-between gap-4">
            <BrandMark />
            <Suspense fallback={<PrimaryNavFallback />}>
              <PrimaryNav />
            </Suspense>
            {/* Below `md` the pipe-separated nav is hidden and this drawer replaces it. */}
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

      {/* The full-width search field, on the viewports where row 1 has no room for it. */}
      <div className="border-b lg:hidden">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
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
