import type { Metadata } from "next"
import { Suspense } from "react"

import { Breadcrumb } from "@/components/ui/misc"
import { Bone, BoneLines, Loading, PageTitleSkeleton } from "@/components/ui/skeletons"
import { requireCustomer } from "@/lib/dal"

import { PrivacySection } from "../sections"

export const metadata: Metadata = {
  title: "Privacy & data",
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <>
      <Breadcrumb items={[{ label: "Account", href: "/account" }, { label: "Privacy & data" }]} className="mb-6" />
      <Suspense fallback={<PrivacySkeleton />}>
        <Body />
      </Suspense>
    </>
  )
}

async function Body() {
  const customer = await requireCustomer("/account/privacy")
  void customer
  return <PrivacySection />
}

function PrivacySkeleton() {
  return (
    <Loading>
      <div className="space-y-8">
        <section>
          <PageTitleSkeleton title="Privacy & data" />
          <ul className="mt-4 divide-y">
            <li className="flex min-h-12 items-center py-3 text-sm">Privacy policy</li>
          </ul>
        </section>
        <section className="rounded-lg border bg-card p-6 shadow-xs">
          <h2 className="text-lg font-medium">Delete account</h2>
          <BoneLines count={3} className="mt-3" />
          <Bone kind="control" className="mt-4 w-40" />
        </section>
      </div>
    </Loading>
  )
}
