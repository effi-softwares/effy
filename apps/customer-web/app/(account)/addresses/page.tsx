import type { Metadata } from "next"
import { Suspense } from "react"

import type { AddressDTO } from "@effy/shared-types"

import { edgeApi } from "@/lib/api/edge"
import { getSession, requireCustomer } from "@/lib/dal"

import { AddressList } from "./_components/AddressList"

export const metadata: Metadata = {
  title: "Your addresses",
  // An address is PII — an account page in a search index is a data leak with a URL (FR-005/FR-019).
  robots: { index: false, follow: false },
}

/** The address book (022). Account-gated + per-customer → request-time read behind a Suspense boundary. */
export default function AddressesPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your addresses</h1>
      <Suspense fallback={<div className="h-48 w-full animate-pulse rounded-lg bg-muted" />}>
        <Addresses />
      </Suspense>
    </div>
  )
}

async function Addresses() {
  await requireCustomer("/addresses")
  const session = await getSession()
  let addresses: AddressDTO[] = []
  if (session?.idToken) {
    try {
      // Cold path — customer profile management (022, routing law 011 FR-028). Per-customer → no cache.
      addresses = await edgeApi(session).get<AddressDTO[]>("/customer/v1/addresses", { cache: "no-store" })
    } catch {
      addresses = []
    }
  }
  return <AddressList initial={addresses} />
}
