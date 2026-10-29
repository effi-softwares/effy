import type { Metadata } from "next"
import { Suspense } from "react"

import { Breadcrumb } from "@/components/ui/misc"
import { Bone, Loading, RowsSkeleton } from "@/components/ui/skeletons"
import { requireCustomer } from "@/lib/dal"

import { PointsTab } from "../PointsTab"

export const metadata: Metadata = {
  title: "Effy points",
  robots: { index: false, follow: false },
}

export default function Page({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  return (
    <>
      <Breadcrumb items={[{ label: "Account", href: "/account" }, { label: "Effy points" }]} className="mb-6" />
      <Suspense fallback={<PointsSkeleton />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Body({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { cursor } = await searchParams
  await requireCustomer("/account/points")
  return <PointsTab cursor={cursor} />
}

function PointsSkeleton() {
  return (
    <Loading>
      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Effy points</h2>
          <p className="text-sm text-muted-foreground">
            Points are credit from Effy. Use them on anything at checkout, delivery included. They have no cash value.
          </p>
        </div>
        <dl className="grid grid-cols-[max-content_1fr] items-center gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Balance</dt>
          <dd>
            <Bone kind="heading" className="w-32" />
          </dd>
        </dl>
        <RowsSkeleton rows={4} trailing="price" className="border-y" />
      </section>
    </Loading>
  )
}
