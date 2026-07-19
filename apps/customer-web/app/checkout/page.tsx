import type { Metadata } from "next"
import { Suspense } from "react"

import type { AddressDTO } from "@effy/shared-types"

import { coreApi, uncached } from "@/lib/api/core"
import { getSession, requireCustomer } from "@/lib/dal"

import { CheckoutFlow } from "./CheckoutFlow"

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
}

/**
 * CHECKOUT (US3) — where Effy finally needs an identity (FR-020). Lives OUTSIDE the `(shop)` quarantine
 * so it may read the session and call the hot path with the customer's token. The gate + data read are
 * inside <Suspense> (request-time data outside a boundary is a cacheComponents build error); the static
 * shell prerenders.
 */
export default function CheckoutPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutGate />
      </Suspense>
    </div>
  )
}

async function CheckoutGate() {
  // A guest is redirected to sign-in and returned here (return-to-intent); a barred customer is refused.
  await requireCustomer("/checkout")

  const session = await getSession()
  let addresses: AddressDTO[] = []
  if (session?.accessToken) {
    try {
      addresses = await coreApi(session.accessToken).get<AddressDTO[]>("/v1/addresses", uncached())
    } catch {
      // A read failure is non-fatal — the customer can add an address in the flow.
    }
  }

  return <CheckoutFlow initialAddresses={addresses} />
}

function CheckoutSkeleton() {
  return (
    <div className="mt-6 space-y-4" aria-hidden="true">
      <div className="h-5 w-64 animate-pulse rounded bg-muted" />
      <div className="h-24 w-full animate-pulse rounded bg-muted" />
      <div className="h-11 w-full animate-pulse rounded bg-muted" />
    </div>
  )
}
