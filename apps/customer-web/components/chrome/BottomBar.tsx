import { Suspense } from "react"
import { Heart, House, LayoutGrid, Package, UserRound } from "lucide-react"

import { BottomBarLink, BottomBarLinkFallback } from "./BottomBarLink"

const ITEMS = [
  { label: "Home", href: "/", Icon: House, exact: true, prefixes: [] },
  { label: "Aisles", href: "/search", Icon: LayoutGrid, exact: false, prefixes: ["/search", "/product"] },
  { label: "Saved", href: "/saved", Icon: Heart, exact: false, prefixes: ["/saved"] },
  { label: "Orders", href: "/orders", Icon: Package, exact: false, prefixes: ["/orders"] },
  { label: "Account", href: "/account", Icon: UserRound, exact: false, prefixes: ["/account", "/addresses"] },
] as const

/**
 * The phone's bottom bar: Home, Aisles, Saved, Orders, Account.
 *
 * Sticky to the bottom of the viewport below `lg`, absent above it. It pads for the home-indicator
 * inset, and each target is 48 tall — the bar is the phone's primary navigation, not a decoration.
 *
 * Orders and Account are signed-in pages; a guest who taps one is taken to sign-in and returned, by
 * the same guard those pages already carry.
 */
export function BottomBar() {
  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-40 grid grid-cols-5 border-t bg-background px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] lg:hidden"
    >
      {ITEMS.map(({ label, href, Icon, exact, prefixes }) => {
        const inner = (
          <>
            <Icon aria-hidden="true" />
            {label}
          </>
        )
        return (
          // `usePathname` suspends while a dynamic route prerenders, so each link has a fallback
          // that is the same link without the "current" mark — the bar is never missing.
          <Suspense key={href} fallback={<BottomBarLinkFallback href={href}>{inner}</BottomBarLinkFallback>}>
            <BottomBarLink href={href} exact={exact} prefixes={prefixes}>
              {inner}
            </BottomBarLink>
          </Suspense>
        )
      })}
    </nav>
  )
}
