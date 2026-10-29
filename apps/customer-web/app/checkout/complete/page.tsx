import type { Metadata } from "next"
import { Check, CircleAlert, Clock } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import type { OrderDTO } from "@effy/shared-types"

import { OrderAddresses } from "@/components/OrderAddresses"
import { ArrivalPanel, ArrivalPanelSkeleton } from "@/components/receipt/ArrivalPanel"
import { DocumentStatusNote } from "@/components/receipt/DocumentStatusNote"
import { ReceiptDocument, ReceiptDocumentSkeleton } from "@/components/receipt/ReceiptDocument"
import { ResendReceipt } from "@/components/receipt/ResendReceipt"
import { ActionLink } from "@/components/storefront/actions"
import { Bone, Loading } from "@/components/ui/skeletons"
import { edgeApi, uncached } from "@/lib/api/edge"
import { getSession, requireCustomer } from "@/lib/dal"

import { ClearCart } from "./ClearCart"
import { completionState, mayClearCart } from "./state"

export const metadata: Metadata = {
  title: "Order confirmation",
  robots: { index: false, follow: false },
}

/**
 * The receipt (019 US3, redesigned by 052 US1). Reads the webhook-authoritative order state from the
 * server — never the browser payment result. One Effy order itemized by product, with NO shop
 * identity. Gated + request-time, so it lives inside <Suspense>.
 */
type ReturnParams = {
  order?: string
  /**
   * Appended by the provider when a shopper returns from a redirect (Klarna, Zip, Afterpay,
   * or a bank's 3DS challenge).
   *
   * It is a hint, not the truth. It is a query parameter on a URL the shopper's browser followed, so
   * it can be edited, replayed or stale. The order state below is read from the platform, which reads
   * the webhook — that is authoritative. This value only decides which words to use
   * while the authoritative answer is still settling.
   */
  redirect_status?: string
}

export default function CompletePage({ searchParams }: { searchParams: Promise<ReturnParams> }) {
  return (
    // `container`, not a per-page `mx-auto max-w-*`. The storefront defines one content
    // column in app/globals.css and its comment records why: the four decisions (centring, full width,
    // the cap, the gutter) had been written out twenty-four times. That is 80rem — far wider than the
    // 42rem this page used — so the layout below is built for the width as two columns rather than
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
    // Finalize the order now via the idempotent confirm fallback, the moment the customer lands here
    // after paying. The webhook is authoritative but may lag (or be misconfigured locally) — and a
    // lingering `pending_payment` order gets reused by the customer's next checkout, whose deterministic
    // idempotency key then returns this order's already-succeeded PaymentIntent (the "second order asks
    // to pay for the first, same amount" bug). Confirming here moves the order out of pending_payment
    // before another checkout can start, on both the inline-success and 3DS-redirect return paths.
    // Best-effort: on failure the webhook remains the backstop and the receipt shows "confirming".
    try {
      await edgeApi(session).post(`/commerce/v1/checkout/confirm`, { orderId: order }, uncached())
    } catch {
      // ignore — webhook backstop
    }
    try {
      dto = await edgeApi(session).get<OrderDTO>(`/commerce/v1/orders/${order}`, uncached())
    } catch {
      dto = null
    }
  }

  // One decision, made in a pure function so the cart rule is testable (`state.ts`). It used to be
  // an unconditional `<ClearCart>` inside the JSX, where nothing could assert it.
  const state = completionState(dto, redirectStatus)

  // An unpaid order is not a receipt and must not empty the basket. The order exists from the intent
  // call, before any money moves, and `GET /v1/orders/{id}` has no status filter, so the page branches on
  // whether it was paid: an abandoned payment (Klarna, Zip, Afterpay, 3DS) comes back to its basket.
  if (!dto || state !== "receipt") {
    const abandoned = state === "abandoned"
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
        <span className="mb-2 grid size-12 place-items-center rounded-lg bg-muted">
          {abandoned ? (
            <CircleAlert aria-hidden="true" className="size-6" />
          ) : (
            <Clock aria-hidden="true" className="size-6" />
          )}
        </span>
        <h1 className="text-xl font-semibold">
          {abandoned ? "Your payment wasn’t completed" : "We’re confirming your payment"}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {abandoned
            ? "Nothing has been charged and your basket is still here. You can go back and try again, or pay another way."
            : "This can take a moment. Your order will appear in your order history shortly."}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {abandoned ? (
            <ActionLink href="/checkout" size="lg">
              Back to checkout
            </ActionLink>
          ) : null}
          <ActionLink href="/orders" variant={abandoned ? "outline" : "primary"} size="lg">
            View your orders
          </ActionLink>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Paid, and only paid — see `state.ts`. */}
      {mayClearCart(state) ? <ClearCart orderId={dto.id} /> : null}

      {/* Confirmation band */}
      <div className="flex flex-col gap-4 pb-8 sm:flex-row sm:items-center sm:gap-5">
        <div aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-muted">
          <Check className="size-6 text-brand" strokeWidth={2.5} />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-sm font-medium text-brand">Payment received</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Thank you</h1>
        </div>
      </div>

      {/* The document, and a rail for what changes */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <ReceiptDocument order={dto} />

          <section className="rounded-lg border bg-card p-6 shadow-xs">
            <OrderAddresses
              shipping={dto.deliveryAddress}
              billing={dto.billingAddress}
              instructions={dto.deliveryInstructions}
            />
          </section>

          <DocumentStatusNote />
        </div>

        <div className="flex flex-col gap-5">
          <ArrivalPanel stage={dto.stage} arrivals={dto.arrivalEstimates ?? []} delivery={dto.delivery} />

          {/* One primary action, then the alternatives. */}
          <div className="flex flex-col gap-3">
            <ActionLink href={`/orders/${dto.id}`} size="lg" className="w-full">
              Track this order
            </ActionLink>
            <ActionLink href="/orders" variant="outline" size="lg" className="w-full">
              Your orders
            </ActionLink>
            <ActionLink href="/" variant="outline" size="lg" className="w-full">
              Keep shopping
            </ActionLink>
          </div>

          <ResendReceipt orderId={dto.id} />

          <p className="text-sm text-muted-foreground">
            Something wrong with this order?{" "}
            <Link href="/help?from=checkout" className="font-medium text-primary underline underline-offset-4">
              Get help
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

/** The receipt while the payment's outcome is read: the band (its words wait for the outcome), the document, the rail. */
function ReceiptSkeleton() {
  return (
    <Loading label="Loading your receipt">
      <div className="flex flex-col gap-4 pb-8 sm:flex-row sm:items-center sm:gap-5">
        <Bone className="size-12 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Bone className="w-32" />
          <Bone kind="title" className="w-40" />
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <ReceiptDocumentSkeleton />
          <section className="grid gap-6 rounded-lg border bg-card p-6 shadow-xs sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Bone className="w-24" />
                <Bone kind="small" className="w-36" />
                <Bone kind="small" className="w-28" />
              </div>
            ))}
          </section>
        </div>
        <div className="flex flex-col gap-5">
          <ArrivalPanelSkeleton />
          <div className="flex flex-col gap-3">
            <Bone kind="control" className="h-12" />
            <Bone kind="control" className="h-12" />
            <Bone kind="control" className="h-12" />
          </div>
        </div>
      </div>
    </Loading>
  )
}
