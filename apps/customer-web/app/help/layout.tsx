import { StorefrontChrome } from "@/app/(shop)/_components/StorefrontChrome"

/**
 * Help wears the storefront frame but lives OUTSIDE the `(shop)` route group, as `/feedback` did.
 *
 * ⚠ Why: the message form's server action reads the session through `lib/dal`, and the dependency
 * guard (`no-amplify-on-guest-path`) forbids anything under `app/(shop)/` from reaching that chain —
 * the rule that keeps the auth SDK out of the guest bundle. The page is still public and still
 * prerendered; only its folder differs.
 */
export default function HelpLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <StorefrontChrome search>{children}</StorefrontChrome>
}
