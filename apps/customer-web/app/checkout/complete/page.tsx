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
import { Display } from "@/components/storefront/kit"
import { coreApi, uncached } from "@/lib/api/core"
import { getSession, requireCustomer } from "@/lib/dal"

import { ClearCart } from "./ClearCart"
import { completionState, mayClearCart } from "./state"

export const metadata: Metadata = {
  title: "Order confirmation",
  robots: { index: false, follow: false },
}

/**
 * The receipt (019 US3, redesigned by 052 US1). Reads the WEBHOOK-AUTHORITATIVE order state from the
 * hot path (R4) — never the browser payment result. ONE Effy order itemized by product, with NO shop
 * identity (FR-029/FR-009). Gated + request-time, so it lives inside <Suspense>.
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
    // ⚠ `container`, not a per-page `mx-auto max-w-*` (052 FR-018a). The storefront defines ONE content
    // column in app/globals.css and its comment records why: the four decisions (centring, full width,
    // the cap, the gutter) had been written out twenty-four times. That is 80rem — far wider than the
    // 42rem this page used — so the layout below is built FOR the width as two columns rather than
    // constrained back down. A single column at 80rem puts the width of the page between an item's
    // name and its price.
    <div className="container py-10">
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

  // ⚠ ONE decision, made in a pure function so the cart rule is testable (`state.ts`). It used to be
  // an unconditional `<ClearCart>` inside the JSX, where nothing could assert it.
  const state = completionState(dto, redirectStatus)

  // ⚠ AN UNPAID ORDER IS NOT A RECEIPT, AND MUST NOT EMPTY A BASKET.
  //
  // The order row is created at INTENT time, so it exists from the moment the shopper reaches the
  // payment step — long before any money moves. `GET /v1/orders/{id}` has no status filter, so a
  // `pending_payment` order comes back like any other. This page used to branch only on whether the
  // order could be FETCHED, which meant every unpaid-but-existing order fell through to the receipt:
  //
  //   • it read "Thank you … Total paid $X" for a payment that had not happened, and
  //   • `<ClearCart>` rendered unconditionally, so a shopper who ABANDONED at Klarna, Zip, Afterpay or
  //     a 3DS challenge came back to an emptied basket.
  //
  // The second is the serious one: nothing was charged, so the basket is the shopper's only way to try
  // again, and the copy in the abandoned branch below *promises* it is still there. Clearing it made
  // that promise false.
  //
  // ⚠ 052 PRESERVES THIS UNCHANGED (FR-017). The redesign is everything BELOW this gate; the gate
  // itself is untouched, because it is the thing standing between a redesign and a re-introduced bug.
  if (!dto || state !== "receipt") {
    const abandoned = state === "abandoned"
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed p-12 text-center">
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

  return (
    <div>
      {/* Paid, and only paid — see `state.ts`. */}
      {mayClearCart(state) ? <ClearCart orderId={dto.id} /> : null}

      {/* ── Confirmation band ──────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 pb-8 sm:flex-row sm:items-center sm:gap-5">
        <div
          aria-hidden="true"
          className="flex size-13 shrink-0 items-center justify-center rounded-full bg-[#eef7ee] dark:bg-[#12220f]"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12.6l4.4 4.4L19 7.4"
              className="stroke-[#0c9409] dark:stroke-[#22c55e]"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
            Payment received
          </p>
          <Display as="h1" size="section">
            Thank you
          </Display>
        </div>
      </div>

      {/* ── The document, and a rail for what changes ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <ReceiptDocument order={dto} />

          <section className="rounded-xl border p-6">
            <OrderAddresses shipping={dto.deliveryAddress} billing={dto.billingAddress} />
          </section>

          <DocumentStatusNote />
        </div>

        <div className="flex flex-col gap-5">
          <ArrivalPanel stage={dto.stage} arrivals={dto.arrivalEstimates ?? []} />

          {/* One primary action, then the alternatives (FR-012). */}
          <div className="flex flex-col gap-2.5">
            <ActionLink href={`/orders/${dto.id}`} size="md" className="w-full">
              Track this order
            </ActionLink>
            <ActionLink href="/orders" variant="outline" size="md" className="w-full">
              Your orders
            </ActionLink>
            <ActionLink href="/" variant="outline" size="md" className="w-full">
              Keep shopping
            </ActionLink>
          </div>

          <ResendReceipt orderId={dto.id} />

          <p className="text-[13px] text-muted-foreground">
            Something wrong with this order?{" "}
            <Link href="/feedback?from=checkout" className="font-medium text-primary hover:underline">
              Get help
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function ReceiptSkeleton() {
  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]" aria-hidden="true">
      <div className="flex flex-col gap-5">
        <div className="h-96 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-32 w-full animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-72 w-full animate-pulse rounded-xl bg-muted" />
    </div>
  )
}
