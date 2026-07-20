import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import type { OrderDTO } from "@effy/shared-types"

import { coreApi, uncached } from "@/lib/api/core"
import { getSession, requireCustomer } from "@/lib/dal"
import { PROGRESS_LABEL, summarizeFulfillment } from "@/lib/fulfillment-progress"
import { formatMoney } from "@/lib/money"

export const metadata: Metadata = {
  title: "Order",
  robots: { index: false, follow: false },
}

/** Order detail / receipt (US5). Reads the webhook-authoritative order; ONE order by product, no shop. */
export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-lg bg-muted" />}>
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

  const addr = dto.deliveryAddress
  return (
    <div>
      <Link href="/orders" className="text-sm text-muted-foreground hover:text-foreground">
        ← Orders
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">{dto.orderNumber}</h1>
      <p className="text-sm text-muted-foreground">
        {dto.paymentStatus === "succeeded" ? "Paid" : "Payment pending"}
      </p>

      <section className="mt-6 rounded-lg border">
        <ul className="divide-y">
          {dto.items.map((item) => (
            <li key={item.productId} className="flex justify-between gap-4 p-4 text-sm">
              <span>
                {item.productName}
                <span className="text-muted-foreground"> × {item.quantity}</span>
              </span>
              <span className="font-medium">{formatMoney(item.lineSubtotalAmount, dto.currency)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t p-4 text-sm">
          <Row label="Items" value={formatMoney(dto.itemSubtotalAmount, dto.currency)} />
          <Row label="Delivery" value={formatMoney(dto.deliveryFeeAmount, dto.currency)} />
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatMoney(dto.grandTotalAmount, dto.currency)}</dd>
          </div>
        </dl>
      </section>

      <FulfillmentProgress dto={dto} />

      <section className="mt-6 text-sm">
        <h2 className="font-medium">Delivering to</h2>
        <p className="mt-1 text-muted-foreground">
          {addr.recipientName}
          <br />
          {addr.line1}
          {addr.line2 ? `, ${addr.line2}` : ""}
          <br />
          {addr.city} {addr.postalCode}, {addr.country}
        </p>
      </section>
    </div>
  )
}

/**
 * Preparation progress (020 US5).
 *
 * Effy is ONE brand: the customer must never learn that their order was split, how many places it
 * was split across, or which places those were (FR-018, SC-009). So this renders a SINGLE aggregate
 * line derived from the portions — never a per-portion list, which would itself disclose the count.
 *
 * Shortfalls are shown at item level but ONLY once a portion is terminal — the backend omits them
 * entirely while picking, so an item flagged and then found never reaches the customer (FR-018b,
 * SC-017). We deliberately do NOT promise a refund: no money moves in this slice (FR-018a), and
 * saying otherwise here would be a lie the platform cannot yet honour.
 */
function FulfillmentProgress({ dto }: { dto: OrderDTO }) {
  if (dto.status !== "paid") return null

  const progress = summarizeFulfillment(dto.fulfillments)
  if (!progress) return null

  return (
    <section className="mt-6 text-sm">
      <h2 className="font-medium">Preparation</h2>
      <p className="mt-1 text-muted-foreground">{PROGRESS_LABEL[progress.stage]}</p>

      {progress.shortfalls.length > 0 && (
        <div className="mt-3 border-l-2 border-destructive/40 pl-3">
          <p className="font-medium">Unavailable</p>
          <p className="mt-1 text-muted-foreground">
            {progress.shortfalls.length === 1 ? "This item was" : "These items were"} out of stock
            and won&apos;t be included:
          </p>
          <ul className="mt-1 text-muted-foreground">
            {progress.shortfalls.map((s) => (
              <li key={s.productName}>
                {s.productName}
                {s.quantity > 1 ? ` \u00d7 ${s.quantity}` : ""}
              </li>
            ))}
          </ul>
          {/* Deliberately no refund promise: no money moves in this slice (FR-018a), and the
              platform cannot yet honour one. Point at a human instead of lying. */}
          <p className="mt-2 text-muted-foreground">
            Contact support about this order and we&apos;ll sort it out.
          </p>
        </div>
      )}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
