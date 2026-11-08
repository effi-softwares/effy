import type { Metadata } from "next"
import { Suspense } from "react"

import type { InboxPageDTO } from "@effy/shared-types"

import { LiveRefresh } from "@/components/live/LiveRefresh"
import { InboxView } from "@/components/notifications/InboxView"
import { Breadcrumb } from "@/components/ui/misc"
import { Bone, Loading, RowsSkeleton } from "@/components/ui/skeletons"
import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession, requireCustomer } from "@/lib/dal"

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
}

const CATEGORIES = ["orders", "points", "offers", "news", "important", "support"] as const
type Search = { filter?: string; category?: string }

/** The address is the list's state: `?filter=unread`, `?category=points`. Anything else is the whole inbox. */
function parseSearch(raw: Search): { filter: "all" | "unread"; category?: (typeof CATEGORIES)[number] } {
  const category = CATEGORIES.find((c) => c === raw.category)
  return { filter: raw.filter === "unread" ? "unread" : "all", ...(category ? { category } : {}) }
}

export default function Page({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <>
      <Breadcrumb items={[{ label: "Account", href: "/account" }, { label: "Notifications" }]} className="mb-6" />
      <Suspense fallback={<InboxSkeleton />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  const view = parseSearch(await searchParams)
  await requireCustomer("/account/notifications")
  const session = await getSession()
  const q = new URLSearchParams()
  if (view.filter !== "all") q.set("filter", view.filter)
  if (view.category) q.set("category", view.category)
  let page: InboxPageDTO | null = null
  try {
    page = session ? await edgeApi(session).get<InboxPageDTO>(`/customer/v1/notifications${q.size ? `?${q}` : ""}`, perCustomer) : null
  } catch {
    page = null
  }
  return (
    <>
      {/* A new notification, or one read or archived on another device, re-renders this page (071, 110). */}
      <LiveRefresh />
      <InboxView initial={page} filter={view.filter} category={view.category} />
    </>
  )
}

function InboxSkeleton() {
  return (
    <Loading>
      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Notifications</h2>
          <p className="text-sm text-muted-foreground">Everything we've told you about your orders and points in the last 6 months.</p>
        </div>
        <div className="flex gap-2">
          <Bone kind="chip" />
          <Bone kind="chip" />
          <Bone kind="chip" />
        </div>
        <RowsSkeleton rows={6} media="round" className="border-y" />
      </section>
    </Loading>
  )
}
