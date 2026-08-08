import { StorefrontChrome } from "@/app/(shop)/_components/StorefrontChrome"

/**
 * The account area.
 *
 * ⚠ IT RENDERS THE SAME CHROME AS THE STOREFRONT (operator direction, 2026-08-08). It used to have
 * its own: a plain coloured circle instead of the brand mark, a four-link nav of its own, and no
 * cart, no search and no footer at all. The effect was that signing in and opening your account
 * looked like leaving the shop for a different website — and the account nav it carried was the only
 * way back, so losing it was not an option until the real header came with it.
 *
 * The old header's own comment claimed to be "the storefront's chrome, minus the shop-only islands".
 * It was not the storefront's chrome; it was a second, smaller one that had drifted. That is the
 * failure mode a shared component removes.
 *
 * ⚠ The route group STAYS separate from `(shop)`, and that is deliberate — see `StorefrontChrome`.
 * `radix-ui`/`vaul` are banned from `app/(shop)/` by the guest-path byte contract and this area uses
 * them legitimately behind a login, so merging the groups would break the quarantine guard.
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
  // ⚠ NO SEARCH. The header is otherwise identical to the storefront's, but a product search box on
  // your addresses or your account settings offers to do something the page it sits on cannot do —
  // and on a phone it costs a whole second row of chrome to say nothing. Catalogue search is reached
  // from the nav, which is right there in the same header.
  return <StorefrontChrome>{children}</StorefrontChrome>
}
