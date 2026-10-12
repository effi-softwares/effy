import { Suspense } from "react"
import Link from "next/link"

import { AisleRow, AisleRowFallback } from "@/components/chrome/AisleRow"
import { BottomBar } from "@/components/chrome/BottomBar"
import { DeliveryBar, DeliveryBarFallback } from "@/components/chrome/DeliveryBar"
import { SavedLink } from "@/components/chrome/SavedLink"
import { UserIsland, UserIslandSkeleton } from "@/components/header/UserIsland"
import { BrandMark } from "@/components/storefront/BrandMark"
import { getCategoriesSafe, topLevel } from "@/lib/categories"

import { HeaderSearch, HeaderSearchFallback } from "./HeaderSearch"
import { MiniCart } from "./MiniCart"
import { MobileNavFallback } from "./MobileNav"
import { MobileNavIsland } from "./MobileNavIsland"
import { StorefrontFooter } from "./StorefrontFooter"
import { ToastRegion } from "./ToastRegion"

/**
 * The storefront frame (reference: Shared components · Storefront header / footer): the black
 * delivery bar, the masthead, the aisle row, the page, the footer, and — on phones — the bottom bar.
 *
 * ⚠ ONE CONTAINER. Every row here uses `container`, as does every page, so left and right edges line
 * up on every screen.
 *
 * ⚠ THE STATIC SHELL. Nothing in this component reads the request. Everything per-customer — the
 * delivery bar, the account trigger, the phone menu — and everything fetched — the aisles — is its
 * own Suspense island with a fallback of the same height, so the shell is cacheable and nothing
 * shifts when an island arrives.
 *
 * `search={false}` is the frame without the search field or the aisle row (the account area passes
 * it when it wants the quieter header).
 */
export function StorefrontChrome({
  children,
  search = false,
}: Readonly<{
  children: React.ReactNode
  search?: boolean
}>) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <div className="bg-foreground text-xs text-background">
        <div className="container flex min-h-9 items-center justify-between gap-4">
          <Suspense fallback={<DeliveryBarFallback />}>
            <DeliveryBar />
          </Suspense>
          <span className="flex shrink-0 items-center gap-4 max-md:hidden">
            <Link href="/orders" className="opacity-85 hover:underline hover:opacity-100">
              Track an order
            </Link>
            <Link href="/help" className="opacity-85 hover:underline hover:opacity-100">
              Help &amp; feedback
            </Link>
            <Link href="/about" className="opacity-85 hover:underline hover:opacity-100">
              About Effy
            </Link>
          </span>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container">
          <div className="flex h-14 items-center gap-2 lg:h-[68px] lg:gap-6">
            <Suspense fallback={<MobileNavFallback />}>
              <MobileNavIsland />
            </Suspense>
            <BrandMark className="max-lg:text-[22px]!" />
            {search && (
              <Suspense fallback={<HeaderSearchFallback className="max-lg:hidden" />}>
                <SearchWithAisles className="max-lg:hidden" />
              </Suspense>
            )}
            <div className="ml-auto flex items-center gap-1">
              <SavedLink />
              <div className="max-lg:hidden">
                <Suspense fallback={<UserIslandSkeleton />}>
                  <UserIsland />
                </Suspense>
              </div>
              <MiniCart />
            </div>
          </div>

          {search && (
            <div className="pb-3 lg:hidden">
              <Suspense fallback={<HeaderSearchFallback size="lg" />}>
                <HeaderSearch size="lg" />
              </Suspense>
            </div>
          )}

          {search && (
            <div className="max-lg:hidden">
              <Suspense fallback={<AisleRowFallback />}>
                <AisleRow />
              </Suspense>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>
      <ToastRegion />
      <StorefrontFooter />
      <BottomBar />
    </div>
  )
}

/** The desktop search field with its aisle chooser — the aisle list is fetched, so this is an island. */
async function SearchWithAisles({ className }: { className?: string }) {
  const aisles = topLevel(await getCategoriesSafe()).map((c) => ({ key: c.key, name: c.name }))
  return <HeaderSearch className={className} aisles={aisles} />
}
