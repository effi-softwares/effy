import type { Metadata } from "next"
import { Suspense } from "react"

import { Breadcrumb } from "@/components/ui/misc"
import { Bone, Loading, PageTitleSkeleton } from "@/components/ui/skeletons"
import { requireCustomer } from "@/lib/dal"

import { PaymentMethods } from "../sections"

export const metadata: Metadata = {
  title: "Payment methods",
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <>
      <Breadcrumb items={[{ label: "Account", href: "/account" }, { label: "Payment methods" }]} className="mb-6" />
      <Suspense fallback={<PaymentSkeleton />}>
        <Body />
      </Suspense>
    </>
  )
}

async function Body() {
  const customer = await requireCustomer("/account/payment")
  void customer
  return <PaymentMethods />
}

function PaymentSkeleton() {
  return (
    <Loading>
      <section>
        <PageTitleSkeleton title="Payment methods" className="mb-6" />
        <ul className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <li key={i} className="flex h-16 items-center gap-3 rounded-xl border border-input px-4">
              <Bone className="h-6 w-10 rounded-sm" />
              <Bone className="w-40" />
            </li>
          ))}
        </ul>
      </section>
    </Loading>
  )
}
