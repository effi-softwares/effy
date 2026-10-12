import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import type { OrderSummaryDTO } from "@effy/shared-types"

import { edgeApi, uncached } from "@/lib/api/edge"
import { getSession, requireCustomer } from "@/lib/dal"
import { formatMoney } from "@/lib/money"
import { LiveRefresh } from "@/components/live/LiveRefresh"
import { Package } from "lucide-react"

import { CoverageNote } from "@/app/(account)/addresses/_components/CoverageNote"
import { btnClass } from "@/components/storefront/actions"
import { EmptyState } from "@/components/storefront/kit"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb } from "@/components/ui/misc"

import { ReorderButton } from "./ReorderButton"

export const metadata: Metadata = {
  title: "Your orders",
  robots: { index: false, follow: false },
}

/** Order history (US5). Most-recent-first; each row opens the full receipt. Gated + request-time → Suspense. */
export default function OrdersPage() {
  return (
    <>
      <Breadcrumb items={[{ label: "Account", href: "/account" }, { label: "Orders" }]} className="mb-6" />
      <h1 className="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">Your orders</h1>
      <LiveRefresh />
      <Suspense fallback={<ListSkeleton />}>
        <OrdersList />
      </Suspense>
    </>
  )
}

const PLACED = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Melbourne" })

async function OrdersList() {
  await requireCustomer("/orders")
  const session = await getSession()

  let orders: OrderSummaryDTO[] = []
  if (session?.accessToken) {
    try {
      orders = await edgeApi(session).get<OrderSummaryDTO[]>("/commerce/v1/orders", uncached())
    } catch {
      orders = []
    }
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No orders yet"
        description="When you place an order it will appear here, and you can follow it to your door."
        action={{ label: "Start shopping", href: "/" }}
      />
    )
  }

  return (
    <ul className="space-y-4">
      {orders.map((o) => {
        const placed = o.placedAt ? PLACED.format(new Date(o.placedAt)) : null
        const pictures = (o.thumbnails ?? []).slice(0, 4)
        return (
          <li key={o.id} className="rounded-lg border bg-card shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b p-4 sm:px-6">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {o.orderNumber}
                  <Badge variant={o.status === "paid" ? "brand-muted" : "secondary"}>{statusLabel(o.status)}</Badge>
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {placed ? `Placed ${placed} · ` : ""}
                  {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                </p>
              </div>
              <p className="text-base font-semibold tabular-nums">{formatMoney(o.grandTotalAmount, o.currency)}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                {pictures.length > 0 && (
                  <ul aria-hidden="true" className="flex gap-2">
                    {pictures.map((src, i) => (
                      <li key={i} className="size-12 overflow-hidden rounded-md bg-muted">
                        {src && <img src={src} alt="" className="size-full object-cover" />}
                      </li>
                    ))}
                  </ul>
                )}
                {o.itemCount > pictures.length && pictures.length > 0 && (
                  <span className="text-sm text-muted-foreground">+{o.itemCount - pictures.length} more</span>
                )}
                {o.delivery ? <CoverageNote coverage={o.delivery.type} /> : null}
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/orders/${o.id}`} className={btnClass("outline", "md")}>
                  View order<span className="sr-only"> {o.orderNumber}</span>
                </Link>
                <ReorderButton orderId={o.id} />
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function statusLabel(status: string): string {
  switch (status) {
    case "paid":
      return "Paid"
    case "pending_payment":
      return "Awaiting payment"
    case "failed":
      return "Payment failed"
    case "canceled":
      return "Cancelled"
    default:
      return status
  }
}

function ListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 w-full animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  )
}
