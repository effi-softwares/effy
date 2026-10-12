import type { Metadata } from "next"
import { Suspense } from "react"

import { Breadcrumb, Skeleton } from "@/components/ui/misc"
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
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
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
