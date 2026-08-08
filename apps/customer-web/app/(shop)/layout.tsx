import { StorefrontChrome } from "./_components/StorefrontChrome"

/**
 * The PUBLIC storefront shell.
 *
 * The chrome itself lives in `StorefrontChrome` because the ACCOUNT area renders the same thing —
 * see that file for the header's structure, its breakpoint rules, and why the account routes are not
 * simply moved into this route group.
 *
 * ⚠ Do NOT call cookies() or headers() in this file. Do NOT import aws-amplify. Both are
 * machine-guarded, but the guard tells you that you broke a rule — not why it exists: either one
 * silently converts every public page from "served instantly from a cached static shell" to
 * "rendered from scratch on every request", which is the difference between the storefront this is
 * meant to be and a slow one.
 */
export default function ShopLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // `search` — this is the catalogue, so it is the area that has something to search. The account
  // area renders the same chrome and deliberately omits it.
  return <StorefrontChrome search>{children}</StorefrontChrome>
}
