import { pageSurface } from "@/components/storefront/kit"

import { CheckoutHeader } from "./_components/CheckoutHeader"

/**
 * The CHECKOUT shell.
 *
 * ⚠ It renders its OWN minimal chrome (`CheckoutHeader`), NOT the storefront's `StorefrontChrome`, and
 * that is deliberate. Checkout is intentionally a focused, distraction-free conversion flow: no search,
 * no category nav, no footer full of links to browse away to. See `CheckoutHeader` for why.
 *
 * ── Why this is a whole separate route group in the first place ─────────────────────────────────
 *
 * `app/checkout/` sits OUTSIDE `app/(shop)/` because the storefront enforces a guest-path byte
 * contract (`aws-amplify` / `radix-ui` / `vaul` are banned from `(shop)`, dependency-cruiser-guarded,
 * so public pages stay a tiny statically-cached PPR bundle). Checkout reads the session
 * (`requireCustomer()`) and drives Stripe Elements — exactly the things that quarantine keeps out — so
 * it cannot live under `(shop)`. Being a separate group does NOT force it to drop the chrome (the
 * account area is also separate yet opts into `StorefrontChrome`); here we choose the minimal shell.
 *
 * ⚠ There is NO auth check in this layout, and that is deliberate — layouts do not re-run on
 * navigation (Partial Rendering), so a guard here would run once and then stop guarding. The check
 * lives in `requireCustomer()`, called by each page in this group.
 */
export default function CheckoutLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`flex min-h-svh flex-col ${pageSurface}`}>
      <CheckoutHeader />
      <main className="flex-1">{children}</main>
    </div>
  )
}
