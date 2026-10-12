import type { Metadata } from "next"
import { Suspense } from "react"

import { Breadcrumb, Skeleton } from "@/components/ui/misc"
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
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
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
