import Link from "next/link"
import { pageSurface } from "@/components/storefront/kit"

/**
 * The account area.
 *
 * ⚠ There is NO auth check in this layout, and that is deliberate — not an oversight.
 *
 * Next's authentication guide is explicit: "Due to Partial Rendering, be cautious when doing checks
 * in Layouts as these DON'T RE-RENDER ON NAVIGATION, meaning the user session won't be checked on
 * every route change." A guard here would run once and then quietly stop guarding.
 *
 * The check lives in `requireCustomer()` (lib/dal.ts), called by every page in this group.
 */
export default function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`flex min-h-svh flex-col ${pageSurface}`}>
      {/* The storefront's chrome, minus the shop-only islands (cart, delivery, search) — the account
          area is not a place to shop, but it must not look like a different product either. That
          discontinuity is exactly what made the old account pages feel bolted on. */}
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Effy home">
            <span className="inline-block size-6 rounded-full bg-primary" aria-hidden="true" />
            <span className="text-xl font-extrabold uppercase tracking-[-0.02em]">Effy</span>
          </Link>
          <div className="flex-1" />
          <nav aria-label="Account" className="flex items-center gap-5">
            <Link href="/browse" className="text-sm hover:text-foreground/70">
              Browse
            </Link>
            <Link href="/orders" className="text-sm hover:text-foreground/70">
              Orders
            </Link>
            {/* 033 FR-054: reachable from the account area. ⚠ This nav listed only Browse / Orders /
                Account — /addresses was missing too, which is why the predecessor's saved page was
                reachable from exactly one footer link. */}
            <Link href="/saved" className="text-sm hover:text-foreground/70">
              Saved items
            </Link>
            <Link href="/account" className="text-sm hover:text-foreground/70">
              Account
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
