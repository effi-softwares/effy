import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import type { OrderDTO } from "@effy/shared-types"

import { OrderAddresses } from "@/components/OrderAddresses"
import { ActionLink } from "@/components/storefront/actions"
import { coreApi, uncached } from "@/lib/api/core"
import { getSession, requireCustomer } from "@/lib/dal"
import { formatMoney } from "@/lib/money"

import { ClearCart } from "./ClearCart"
import { Display } from "@/components/storefront/kit"

export const metadata: Metadata = {
  title: "Order confirmation",
  robots: { index: false, follow: false },
}

/**
 * The receipt (US3). Reads the WEBHOOK-AUTHORITATIVE order state from the hot path (R4) — never the
 * browser payment result. ONE Effy order itemized by product, with NO shop identity (FR-029). Gated +
 * request-time, so it lives inside <Suspense>.
 */
type ReturnParams = {
  order?: string
  /**
   * 051 US4 — appended by the provider when a shopper returns from a redirect (Klarna, Zip, Afterpay,
   * or a bank's 3DS challenge).
   *
   * ⚠ IT IS A HINT, NOT THE TRUTH. It is a query parameter on a URL the shopper's browser followed, so
   * it can be edited, replayed or stale. The order state below is read from the platform, which reads
   * the webhook — that is authoritative (019 R4, FR-039). This value only decides which WORDS to use
   * while the authoritative answer is still settling.
   */
  redirect_status?: string
}

export default function CompletePage({ searchParams }: { searchParams: Promise<ReturnParams> }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Suspense fallback={<ReceiptSkeleton />}>
        <Receipt searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Receipt({ searchParams }: { searchParams: Promise<ReturnParams> }) {
  const { order, redirect_status: redirectStatus } = await searchParams
  if (!order) notFound()

  await requireCustomer(`/checkout/complete?order=${order}`)

  const session = await getSession()
  let dto: OrderDTO | null = null
  if (session?.accessToken) {
    // Finalize the order NOW via the idempotent confirm fallback, the moment the customer lands here
    // after paying. The webhook is authoritative but may lag (or be misconfigured locally) — and a
    // lingering `pending_payment` order gets REUSED by the customer's NEXT checkout, whose deterministic
    // idempotency key then returns THIS order's already-succeeded PaymentIntent (the "second order asks
    // to pay for the first, same amount" bug). Confirming here moves the order out of pending_payment
    // before another checkout can start, on both the inline-success and 3DS-redirect return paths.
    // Best-effort: on failure the webhook remains the backstop and the receipt shows "confirming".
    try {
      await coreApi(session.accessToken).post(`/v1/checkout/confirm`, { orderId: order }, uncached())
    } catch {
      // ignore — webhook backstop
    }
    try {
      dto = await coreApi(session.accessToken).get<OrderDTO>(`/v1/orders/${order}`, uncached())
    } catch {
      dto = null
    }
  }

  if (!dto) {
    // ⚠ 051 US4 — a shopper who ABANDONED at the provider must not be told their payment is being
    // confirmed. Nothing was charged and their basket is intact; saying "confirming" would leave them
    // waiting for an order that is never coming (US4 scenario 5, FR-036).
    const abandoned = redirectStatus === "failed" || redirectStatus === "canceled"
    return (
      <div className="rounded-2xl border border-dashed p-12 text-center">
        <h1 className="text-lg font-medium">
          {abandoned ? "Your payment wasn’t completed" : "We’re confirming your payment"}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {abandoned
            ? "Nothing has been charged and your basket is still here. You can go back and try again, or pay another way."
            : "This can take a moment. Your order will appear in your order history shortly."}
        </p>
        {abandoned ? (
          <Link
            href="/checkout"
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            Back to checkout
          </Link>
        ) : null}
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
        <Display as="h1" size="section" className="mt-1">Thank you</Display>
        <p className="mt-1 text-sm text-muted-foreground">
          Order <span className="font-medium text-foreground">{dto.orderNumber}</span>
        </p>
      </div>

      <section className="rounded-2xl border">
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
          {/*
            ⚠ 051 FR-043 — delivery was inside the total and shown nowhere. A receipt whose lines do
            not add up to its total is not a receipt a shopper can check, and for a GST-inclusive
            Australian sale that is a real gap rather than a cosmetic one.
          */}
          {dto.deliveryFeeAmount ? (
            <Row label="Delivery" value={formatMoney(dto.deliveryFeeAmount, dto.currency)} />
          ) : null}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total paid</dt>
            <dd>{formatMoney(dto.grandTotalAmount, dto.currency)}</dd>
          </div>
        </dl>
      </section>


      <OrderAddresses shipping={dto.deliveryAddress} billing={dto.billingAddress} />

      <div className="mt-8 flex gap-3">
        <ActionLink href="/orders" variant="outline" size="md">
          Your orders
        </ActionLink>
        <ActionLink href="/" size="md">
          Keep shopping
        </ActionLink>
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
