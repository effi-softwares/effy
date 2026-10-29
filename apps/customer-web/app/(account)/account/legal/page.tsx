import type { Metadata } from "next"
import { Suspense } from "react"

import { Breadcrumb } from "@/components/ui/misc"
import { Loading } from "@/components/ui/skeletons"
import { requireCustomer } from "@/lib/dal"

import { LegalSection } from "../sections"

export const metadata: Metadata = {
  title: "Legal",
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <>
      <Breadcrumb items={[{ label: "Account", href: "/account" }, { label: "Legal" }]} className="mb-6" />
      <Suspense fallback={<LegalSkeleton />}>
        <Body />
      </Suspense>
    </>
  )
}

async function Body() {
  const customer = await requireCustomer("/account/legal")
  void customer
  return <LegalSection />
}

/** The documents are fixed; only who is signed in is being read, so the page itself is the fallback. */
function LegalSkeleton() {
  return (
    <Loading>
      <LegalSection />
    </Loading>
  )
}
