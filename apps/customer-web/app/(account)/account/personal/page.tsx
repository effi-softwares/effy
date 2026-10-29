import type { Metadata } from "next"
import { Suspense } from "react"

import { Breadcrumb } from "@/components/ui/misc"
import { Bone, Loading, PageTitleSkeleton } from "@/components/ui/skeletons"
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
      <Suspense fallback={<PersonalSkeleton />}>
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
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Personal info</h1>
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

function PersonalSkeleton() {
  return (
    <Loading>
      <div className="space-y-6">
        <PageTitleSkeleton
          title="Personal info"
          description="Your name, phone and email. We use these for your orders and receipts."
        />
        <section className="rounded-lg border bg-card shadow-xs">
          <ul className="divide-y">
            {["Name", "Mobile number", "Email"].map((label, i) => (
              <li key={label} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <Bone className={i === 2 ? "w-56" : "w-36"} />
                </div>
                {i < 2 ? <Bone kind="control" className="h-9 w-20" /> : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Loading>
  )
}
