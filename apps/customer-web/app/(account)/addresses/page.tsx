import type { Metadata } from "next"
import { Suspense } from "react"

import { Breadcrumb, Skeleton } from "@/components/ui/misc"
import { requireCustomer } from "@/lib/dal"

import { AddressBook } from "@/app/(account)/account/sections"

export const metadata: Metadata = {
  title: "Address book",
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <>
      <Breadcrumb items={[{ label: "Account", href: "/account" }, { label: "Address book" }]} className="mb-6" />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
        <Body />
      </Suspense>
    </>
  )
}

async function Body() {
  const customer = await requireCustomer("/addresses")
  void customer
  return <AddressBook />
}
