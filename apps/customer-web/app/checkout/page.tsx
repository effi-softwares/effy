import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"

import { requireCustomer } from "@/lib/dal"

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
}

/**
 * CHECKOUT — the point at which Effy finally needs to know who you are (US3, FR-019).
 *
 * ⚠ THIS IS A PLACEHOLDER. There is no cart, no order, no payment in this slice — the commerce
 * domain is deliberately out of scope (operator decision, 2026-07-14), and `core-api` has no
 * product tables at all.
 *
 * What is REAL here is the MECHANISM, and the mechanism is the point:
 *
 *   • A guest browses the entire store without ever being asked to sign in (FR-018).
 *   • The FIRST action that genuinely requires an identity is ordering — and only here does the
 *     demand appear (FR-019).
 *   • Authenticating does not cost them their place: they land back exactly here (FR-020).
 *
 * That ordering is far harder to retrofit than to establish, which is why it is built now, before
 * there is a cart to lose. The checkout slice fills this page in; it does not have to invent the
 * guarantee.
 *
 * ⚠ NOTE THE <Suspense> BOUNDARY. It is not decoration. Under `cacheComponents`, request-time data
 * (the session) read OUTSIDE a boundary is a BUILD ERROR — "Uncached data was accessed outside of
 * <Suspense>. This delays the entire page from rendering." The static shell below therefore
 * prerenders, and only the identity-dependent part streams. The framework refuses to let us build
 * the slow version, which is precisely why `cacheComponents` is on.
 */
export default function CheckoutPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      {/* Static shell — prerendered, instant. */}
      <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>

      <Suspense fallback={<IdentitySkeleton />}>
        <CheckoutIdentity />
      </Suspense>

      <div className="mt-10 rounded-lg border border-dashed p-12 text-center">
        <h2 className="text-lg font-medium">Ordering is on its way</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Your cart and payment arrive with the next release. What already works is the part that
          matters most: you browsed as a guest, and we only asked who you were when it counted.
        </p>
      </div>

      <div className="mt-8 flex gap-3">
        <Link
          href="/browse"
          className="inline-flex h-11 items-center rounded-md border px-6 text-sm font-medium hover:bg-accent"
        >
          Keep browsing
        </Link>
        <Link
          href="/account"
          className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Your account
        </Link>
      </div>
    </div>
  )
}

/**
 * ⚠ `requireCustomer` is NOT a cookie check. It verifies the session AND consults the platform's
 * own record, so a BARRED customer is refused here while holding a perfectly valid token (FR-025).
 * `proxy.ts` also redirects unauthenticated visitors, but that is only an optimisation — THIS is
 * the gate.
 */
async function CheckoutIdentity() {
  const customer = await requireCustomer("/checkout")

  return (
    <p className="mt-3 text-muted-foreground">
      You&apos;re signed in as{" "}
      <strong className="text-foreground" data-testid="checkout-identity">
        {customer.email}
      </strong>
      . This is where your order will be placed.
    </p>
  )
}

function IdentitySkeleton() {
  return <div className="mt-3 h-5 w-72 animate-pulse rounded bg-muted" aria-hidden="true" />
}
