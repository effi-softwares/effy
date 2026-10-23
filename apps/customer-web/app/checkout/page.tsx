import type { Metadata } from "next"
import { Suspense } from "react"

import Link from "next/link"
import { MessageSquare } from "lucide-react"


import type { AddressDTO } from "@effy/shared-types"

import { edgeApi } from "@/lib/api/edge"
import { getSession, requireCustomer } from "@/lib/dal"

import { CheckoutFlow } from "./CheckoutFlow"

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
}

/**
 * Checkout — where Effy finally needs an identity. Lives outside the `(shop)` quarantine
 * so it may read the session and call the backend with the customer's token. The gate + data read are
 * inside <Suspense> (request-time data outside a boundary is a cacheComponents build error); the static
 * shell prerenders.
 */
export default function CheckoutPage() {
  return (
    <div className="container mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Checkout</h1>
        <Link
          href="/help?from=checkout"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-4"
        >
          <MessageSquare aria-hidden="true" className="size-4" />
          How do you like our checkout? Give us feedback
        </Link>
      </div>
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
  if (session?.idToken) {
    try {
      // Address management is on the cold path (edge-api/customer, 022); checkout reads it to
      // pre-select a delivery address. cache: "no-store" — per-customer, never cached.
      addresses = await edgeApi(session).get<AddressDTO[]>("/customer/v1/addresses", { cache: "no-store" })
    } catch {
      // A read failure is non-fatal — the customer can add an address in the flow.
    }
  }

  return <CheckoutFlow initialAddresses={addresses} />
}

function CheckoutSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-12 w-full animate-pulse rounded-md bg-muted" />
    </div>
  )
}
