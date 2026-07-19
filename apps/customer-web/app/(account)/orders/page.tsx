import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import type { OrderSummaryDTO } from "@effy/shared-types"

import { coreApi, uncached } from "@/lib/api/core"
import { getSession, requireCustomer } from "@/lib/dal"
import { formatMoney } from "@/lib/money"

export const metadata: Metadata = {
  title: "Your orders",
  robots: { index: false, follow: false },
}

/** Order history (US5). Most-recent-first; each row opens the full receipt. Gated + request-time → Suspense. */
export default function OrdersPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your orders</h1>
      <Suspense fallback={<ListSkeleton />}>
        <OrdersList />
      </Suspense>
    </div>
  )
}

async function OrdersList() {
  await requireCustomer("/orders")
  const session = await getSession()
  let orders: OrderSummaryDTO[] = []
  if (session?.accessToken) {
    try {
      orders = await coreApi(session.accessToken).get<OrderSummaryDTO[]>("/v1/orders", uncached())
    } catch {
      orders = []
    }
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">You haven’t placed any orders yet.</p>
        <Link href="/" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          Start shopping
        </Link>
      </div>
    )
  }

  return (
    <ul className="divide-y rounded-lg border">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-accent">
            <div>
              <div className="font-medium">{o.orderNumber}</div>
              <div className="text-sm text-muted-foreground">
                {o.itemCount} item{o.itemCount === 1 ? "" : "s"} · {statusLabel(o.status)}
              </div>
            </div>
            <div className="text-sm font-medium">{formatMoney(o.grandTotalAmount, o.currency)}</div>
          </Link>
        </li>
      ))}
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
    default:
      return status
  }
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  )
}
