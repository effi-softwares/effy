import type { Metadata } from "next"
import { Suspense } from "react"

import { Breadcrumb } from "@/components/ui/misc"
import { Bone, Loading, PageTitleSkeleton } from "@/components/ui/skeletons"
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
      <Suspense fallback={<AddressesSkeleton />}>
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

function AddressesSkeleton() {
  return (
    <Loading>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageTitleSkeleton
            title="Address book"
            description="Where we deliver. Each address shows who can deliver there."
          />
          <Bone kind="control" className="w-36" />
        </div>
        <ul className="grid items-start gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <li key={i} className="flex flex-col rounded-lg border bg-card shadow-xs">
              <div className="flex flex-col gap-2 p-6">
                <Bone className="w-32" />
                <Bone className="w-48" />
                <Bone className="w-40" />
                <Bone kind="small" className="mt-3 w-36" />
              </div>
              <div className="flex gap-2 border-t px-6 py-4">
                <Bone kind="control" className="h-9 w-20" />
                <Bone kind="control" className="h-9 w-24" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Loading>
  )
}
