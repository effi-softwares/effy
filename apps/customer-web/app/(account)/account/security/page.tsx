import type { Metadata } from "next"
import { Suspense } from "react"

import { Breadcrumb } from "@/components/ui/misc"
import { Bone, Loading, PageTitleSkeleton } from "@/components/ui/skeletons"
import { requireCustomer } from "@/lib/dal"

import { SecuritySection } from "../sections"

export const metadata: Metadata = {
  title: "Security",
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <>
      <Breadcrumb items={[{ label: "Account", href: "/account" }, { label: "Security" }]} className="mb-6" />
      <Suspense fallback={<SecuritySkeleton />}>
        <Body />
      </Suspense>
    </>
  )
}

async function Body() {
  const customer = await requireCustomer("/account/security")
  return <SecuritySection hasPassword={customer.hasPassword} passwordUpdatedAt={customer.passwordUpdatedAt} />
}

function SecuritySkeleton() {
  return (
    <Loading>
      <section>
        <PageTitleSkeleton title="Security" />
        <div className="mt-6 divide-y">
          <div className="flex flex-col gap-4 py-6 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h2 className="text-lg font-medium">Password</h2>
              <Bone className="w-56" />
            </div>
            <Bone kind="control" className="w-40" />
          </div>
          <div className="space-y-4 py-6">
            <h2 className="text-lg font-medium">Sessions</h2>
            <Bone kind="control" className="w-28" />
          </div>
        </div>
      </section>
    </Loading>
  )
}
