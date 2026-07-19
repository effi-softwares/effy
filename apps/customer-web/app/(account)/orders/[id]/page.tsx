import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import type { OrderDTO } from "@effy/shared-types"

import { coreApi, uncached } from "@/lib/api/core"
import { getSession, requireCustomer } from "@/lib/dal"
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
