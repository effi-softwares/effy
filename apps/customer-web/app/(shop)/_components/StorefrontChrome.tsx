import { Suspense } from "react"

import { BrandMark } from "@/components/storefront/BrandMark"
import { pageSurface } from "@/components/storefront/kit"
import { UserIsland, UserIslandSkeleton } from "@/components/header/UserIsland"

import { HeaderSearch, HeaderSearchFallback } from "./HeaderSearch"
import { InfoBar } from "./InfoBar"
import { MiniCart } from "./MiniCart"
import { MobileNavFallback } from "./MobileNav"
import { MobileNavIsland } from "./MobileNavIsland"
import { PrimaryNav, PrimaryNavFallback } from "./PrimaryNav"
import { StorefrontFooter } from "./StorefrontFooter"
import { ToastRegion } from "./ToastRegion"

/**
 * THE STOREFRONT CHROME — information bar, header, mobile search row, footer and toast region.
 *
 * ⚠ IT IS SHARED BY TWO ROUTE GROUPS, and that is the entire reason it is a component rather than
 * markup inside `(shop)/layout.tsx`. The account area (`/account`, `/addresses`, `/saved`,
 * `/orders`) had its OWN cut-down header — a different logo (a plain coloured circle, not the brand
 * mark), a different nav, no cart, no search, no footer. Signing in and opening your account looked
 * like leaving the store for a different website. Copy-pasting the real header into that layout
 * would have fixed today's symptom and guaranteed the two drift apart by the next change.
 *
 * ── ⚠ Why the account pages are NOT simply moved into `app/(shop)/` ────────────────────────────
 *
 * That is the obvious fix and it is the wrong one. `contracts/customer-ui.contract.md §1` forbids
 * `radix-ui` / `vaul` / `sonner` from being REACHABLE from `app/(shop)/`, enforced by
 * dependency-cruiser, because every public route has a measured byte budget. The account area uses
 * those primitives legitimately (`AddressFormModal`, `FieldEditor`, `DeleteAccountFlow`) — it sits
 * behind a login, where the contract explicitly says they remain the standard. Moving those routes
 * under `(shop)` would break the guard AND put a dialog library on the guest path's budget.
 *
 * So the route groups stay separate — which is what keeps the quarantine meaningful — and the chrome
 * travels to them instead.
 *
 * ⚠ It lives in `(shop)/_components/` rather than `components/` only because `PrimaryNav`,
 * `MobileNav` and `HeaderSearch` are operator-LOCKED at those exact paths
 * (`scripts/check-storefront-locks.sh`); relocating them would mean editing the lock list in the
 * same breath as the files it protects.
 *
 * ⚠ Do NOT call cookies() or headers() in this component or in the layouts that render it. The
 * dynamic reads belong to the <Suspense> islands below — either one hoisted out silently converts
 * every public page from "served instantly from a cached static shell" to "rendered from scratch on
 * every request".
 *
 * ── The header, after the shadcn navbar-01 pattern ─────────────────────────────────────────────
 *
 *   info    shop-level announcement (dark, scrolls away)
 *   ═══════════════════════════════════════════════════════════════════════════════════
 *   ≥ lg    logo · primary nav          ·          search · cart · account
 *   ───────────────────────────────────────────────────────────────────────────────────
 *   < lg    logo                        ·          cart · menu
 *           full-width search (its own row, below the sticky header)
 *
 * ⚠ THE DESKTOP THRESHOLD IS `lg`, NOT `md`. Five things share one row — mark, four pipe-separated
 * links, a search field, the cart and the account control — and at 768 px they do not fit without
 * the nav wrapping into the search box. Below `lg` the links and the account control move into the
 * drawer, which is what makes the single row possible at all.
 *
 * ⚠ `PrimaryNav` (`hidden lg:flex`) and `MobileNav` (`lg:hidden`) MUST keep the same breakpoint, or
 * the same four links are in the accessibility tree twice at some width.
 *
 * ⚠ NO blur and NO translucency — the header is opaque and shares the page surface.
 */
export function StorefrontChrome({
  children,
  search = false,
}: Readonly<{
  children: React.ReactNode
  /**
   * Does this area put a product search in its header?
   *
   * ⚠ IT DEFAULTS TO `false`, which is the opposite of what you would expect from "the storefront
   * chrome" — and it is the point. Search is an affordance for BROWSING A CATALOGUE, so it belongs
   * to the areas that have one; the account area does not, and a search box on your addresses page
   * offers to do something the page cannot do. Defaulting to `true` would mean every future area
   * (checkout, help, a returns flow) silently inherits a control nobody chose for it, and nothing
   * would fail. Defaulting to `false` means each area has to say it wants one — the wrong answer is
   * then a missing control somebody notices, not a stray control nobody questions.
   *
   * It governs BOTH placements — the compact field at `lg` and the full-width row beneath the header
   * on smaller screens. They are one decision wearing two layouts, and splitting them into two props
   * is how a surface ends up with search on a phone and none on a laptop.
   */
  search?: boolean
}>) {
  return (
    <div className={`flex min-h-svh flex-col ${pageSurface}`}>
      {/* ── The information bar ──────────────────────────────────────────────────────────────
          A slim dark strip above the header, carrying shop-level information. It is the detail that
          reads "real shop" rather than "landing page", and it costs one row of height.

          ⚠ Deliberately NOT sticky. It scrolls away while the header below it pins — an announcement
          is worth one read, and keeping it on screen forever would spend permanent vertical space on
          something nobody re-reads.

          ⚠ Every line it cycles must be TRUE of this platform — see `InfoBar` for what that rules
          out and why each line is defensible. */}
      <InfoBar />

      <header className={`sticky top-0 z-40 border-b ${pageSurface}`}>
        <div className="container flex h-16 items-center gap-4 lg:gap-6">
          {/* Identity, then the catalogue — the two things that answer "where am I and what is here". */}
          <BrandMark />
          <Suspense fallback={<PrimaryNavFallback />}>
            <PrimaryNav />
          </Suspense>

          {/* `flex-1` + `justify-end` rather than `justify-between`: the nav must sit BESIDE the mark,
              not spread away from it, so the row reads left-to-right as identity → catalogue →
              actions. Taking the remaining space (instead of `ml-auto`, which only pushes) is what
              lets the search field below grow into whatever the nav and the actions leave over. */}
          <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
            {/* FR-011: a persistent search entry. Compact here so it does not crowd the row; the
                full-width field appears under the header on small screens.
                ⚠ Wrapped in <Suspense> because HeaderSearch reads useSearchParams(), which under
                cacheComponents is a dynamic read — outside a boundary it makes the whole route
                blocking, and the build fails rather than letting that happen. The fallback is the
                same control minus the value, so the shell still ships a usable box.

                ⚠ FLUID, not a fixed width per breakpoint. It was `lg:w-60 xl:w-72`, and 240px could
                not hold its own placeholder — the field read "Search groceries, brands anc" on a
                laptop. Picking a bigger fixed number only moves the clipping to a different
                viewport, because the space actually available here depends on the nav's width AND
                on whether the account control says "Sign in" or the customer's name.

                So it takes what is left: `flex-1` to grow, `max-w-sm` so it never becomes an
                absurdly long bar on a wide screen, `min-w-0` so it is the thing that yields when the
                row is tight — `PrimaryNav` is `shrink-0`, so the alternative to the field narrowing
                is the nav wrapping, which is worse. The fallback MUST carry the same classes or the
                box changes size when the real field streams in. */}
            {search && (
              <Suspense
                fallback={<HeaderSearchFallback className="hidden min-w-0 max-w-sm flex-1 lg:block" />}
              >
                <HeaderSearch className="hidden min-w-0 max-w-sm flex-1 lg:block" />
              </Suspense>
            )}

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
                same four links AND the account control, the latter as a slide-in second level.
                ⚠ DYNAMIC HOLE: the island reads the session so the drawer can show a guest a sign-in
                button and a customer their account. It must stay inside this <Suspense>. */}
            <Suspense fallback={<MobileNavFallback />}>
              <MobileNavIsland />
            </Suspense>
          </div>
        </div>
      </header>

      {/* The full-width search field, on the viewports where the single header row has no room for it.
          ⚠ Deliberately OUTSIDE the sticky <header>: it is a second row on a phone, and pinning both
          would spend a quarter of a small viewport on chrome that is only needed once per visit. */}
      {search && (
        <div className="border-b lg:hidden">
          <div className="container py-4">
            <Suspense fallback={<HeaderSearchFallback size="lg" />}>
              <HeaderSearch size="lg" />
            </Suspense>
          </div>
        </div>
      )}

      <main className="flex-1">{children}</main>

      {/* Transient feedback for adds, removals and failures (025 US4). */}
      <ToastRegion />

      <StorefrontFooter />
    </div>
  )
}
