import type { Metadata } from "next"
import { Suspense } from "react"

import { Breadcrumb, Skeleton } from "@/components/ui/misc"
import { requireCustomer } from "@/lib/dal"

import { EmailDeliveryNotice } from "../EmailDeliveryNotice"
import { PersonalInfo } from "../PersonalInfo"

export const metadata: Metadata = {
  title: "Personal info",
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <>
      <Breadcrumb items={[{ label: "Account", href: "/account" }, { label: "Personal info" }]} className="mb-6" />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
        <Body />
      </Suspense>
    </>
  )
}

async function Body() {
  const customer = await requireCustomer("/account/personal")
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Personal info</h1>
        <p className="text-sm text-muted-foreground">Your name, phone and email. We use these for your orders and receipts.</p>
      </div>
      <EmailDeliveryNotice state={customer.emailDelivery} email={customer.email} />
      <PersonalInfo
        givenName={customer.givenName}
        familyName={customer.familyName}
        phone={customer.phone}
        email={customer.email}
      />
    </div>
  )
}
