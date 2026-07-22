import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import type { OrderDTO } from "@effy/shared-types"

import { DeliveryBreakdown } from "@/components/DeliveryBreakdown"
import { OrderAddresses } from "@/components/OrderAddresses"
import { coreApi, uncached } from "@/lib/api/core"
import { getSession, requireCustomer } from "@/lib/dal"
import { formatMoney } from "@/lib/money"

import { ClearCart } from "./ClearCart"

export const metadata: Metadata = {
  title: "Order confirmation",
  robots: { index: false, follow: false },
}

/**
 * The receipt (US3). Reads the WEBHOOK-AUTHORITATIVE order state from the hot path (R4) — never the
 * browser payment result. ONE Effy order itemized by product, with NO shop identity (FR-029). Gated +
 * request-time, so it lives inside <Suspense>.
 */
export default function CompletePage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Suspense fallback={<ReceiptSkeleton />}>
        <Receipt searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Receipt({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams
  if (!order) notFound()

  await requireCustomer(`/checkout/complete?order=${order}`)

  const session = await getSession()
  let dto: OrderDTO | null = null
  if (session?.accessToken) {
    try {
      dto = await coreApi(session.accessToken).get<OrderDTO>(`/v1/orders/${order}`, uncached())
    } catch {
      dto = null
    }
  }

  if (!dto) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <h1 className="text-lg font-medium">We’re confirming your payment</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          This can take a moment. Your order will appear in your order history shortly.
        </p>
        <Link href="/orders" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          View your orders
        </Link>
      </div>
    )
  }

  const paid = dto.paymentStatus === "succeeded" || dto.status === "paid"

  return (
    <div>
      <ClearCart orderId={dto.id} />

      <div className="mb-6 text-center">
        <p className="text-sm font-medium text-primary">{paid ? "Payment received" : "Order received"}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Thank you</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Order <span className="font-medium text-foreground">{dto.orderNumber}</span>
        </p>
      </div>

      <section className="rounded-lg border">
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
            <dt>Total paid</dt>
            <dd>{formatMoney(dto.grandTotalAmount, dto.currency)}</dd>
          </div>
        </dl>
      </section>

      <DeliveryBreakdown fulfillments={dto.fulfillments} currency={dto.currency} />

      <OrderAddresses shipping={dto.deliveryAddress} billing={dto.billingAddress} />

      <div className="mt-8 flex gap-3">
        <Link
          href="/orders"
          className="inline-flex h-11 items-center rounded-md border px-6 text-sm font-medium hover:bg-accent"
        >
          Your orders
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Keep shopping
        </Link>
      </div>
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

function ReceiptSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="mx-auto h-6 w-40 animate-pulse rounded bg-muted" />
      <div className="h-40 w-full animate-pulse rounded bg-muted" />
    </div>
  )
}
