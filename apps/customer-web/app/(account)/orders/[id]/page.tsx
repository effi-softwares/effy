import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import type { OrderDTO } from "@effy/shared-types"

import { OrderAddresses } from "@/components/OrderAddresses"
import { ArrivalPanel } from "@/components/receipt/ArrivalPanel"
import { DocumentStatusNote } from "@/components/receipt/DocumentStatusNote"
import { ReceiptDocument } from "@/components/receipt/ReceiptDocument"
import { ResendReceipt } from "@/components/receipt/ResendReceipt"
import { ActionLink } from "@/components/storefront/actions"
import { coreApi, uncached } from "@/lib/api/core"
import { getSession, requireCustomer } from "@/lib/dal"
import { shortfallsFrom } from "@/lib/fulfillment-progress"

export const metadata: Metadata = {
  title: "Order",
  robots: { index: false, follow: false },
}

/**
 * Order detail (019 US5) — THE SAME DOCUMENT as the checkout receipt, reached from history.
 *
 * ⚠ It shares `ReceiptDocument`/`ArrivalPanel`/`DocumentStatusNote` with `/checkout/complete` and uses
 * the SAME `container` column (052 FR-018a, research R12). Before this it rendered a bespoke,
 * thinner version of the same facts at `max-w-2xl`, so one document had two appearances depending on
 * how the customer arrived at it. Both pages move together or neither does.
 */
export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="container py-8">
      <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-xl bg-muted" />}>
        <OrderDetail params={params} />
      </Suspense>
    </div>
  )
}

async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireCustomer(`/orders/${id}`)

  const session = await getSession()
  let dto: OrderDTO | null = null
  if (session?.accessToken) {
    try {
      dto = await coreApi(session.accessToken).get<OrderDTO>(`/v1/orders/${id}`, uncached())
    } catch (err) {
      if ((err as { status?: number }).status === 404) notFound()
      dto = null
    }
  }
  if (!dto) notFound()

  const shortfalls = dto.status === "paid" ? shortfallsFrom(dto.fulfillments) : []

  return (
    <div>
      <Link href="/orders" className="text-sm text-muted-foreground hover:text-foreground">
        ← Orders
      </Link>

      <div className="grid grid-cols-1 items-start gap-8 pt-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <ReceiptDocument order={dto} />

          {shortfalls.length > 0 ? <Unavailable shortfalls={shortfalls} /> : null}

          <section className="rounded-xl border p-6">
            <OrderAddresses shipping={dto.deliveryAddress} billing={dto.billingAddress} />
          </section>

          <DocumentStatusNote />
        </div>

        <div className="flex flex-col gap-5">
          {/* ⚠ `dto.stage` is SERVER-DERIVED. This page used to recompute it from `fulfillments`; see
              lib/fulfillment-progress.ts for why that is gone (052 FR-008). */}
          <ArrivalPanel stage={dto.stage} arrivals={dto.arrivalEstimates ?? []} />

          <div className="flex flex-col gap-2.5">
            <ActionLink href="/" size="md" className="w-full">
              Keep shopping
            </ActionLink>
          </div>

          <ResendReceipt orderId={dto.id} />

          <p className="text-[13px] text-muted-foreground">
            Something wrong with this order?{" "}
            <Link href="/feedback" className="font-medium text-primary hover:underline">
              Get help
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Items the customer paid for and will not receive (020 FR-018b).
 *
 * ⚠ Deliberately NO refund promise: no money moves in this slice (FR-018a) and the platform cannot yet
 * honour one. Point at a human instead of saying something untrue on a financial record.
 */
function Unavailable({ shortfalls }: { shortfalls: { productName: string; quantity: number }[] }) {
  return (
    <section className="rounded-xl border p-6">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-[#e01010] dark:bg-[#ff6b6b]"
        />
        <h2 className="text-sm font-medium">Unavailable</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {shortfalls.length === 1 ? "This item was" : "These items were"} out of stock and won&apos;t be
        included:
      </p>
      <ul className="mt-1.5 text-sm text-muted-foreground">
        {shortfalls.map((s) => (
          <li key={s.productName}>
            {s.productName}
            {s.quantity > 1 ? ` × ${s.quantity}` : ""}
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-sm text-muted-foreground">
        Contact support about this order and we&apos;ll sort it out.
      </p>
    </section>
  )
}
