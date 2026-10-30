import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import type { DeliveryNoteDTO, OrderDTO } from "@effy/shared-types"

import { CancelOrder } from "./CancelOrder"
import { RefundBlock } from "./RefundBlock"
import { RequestRefund } from "./RequestRefund"

import { OrderAddresses } from "@/components/OrderAddresses"
import { ArrivalPanel, ArrivalPanelSkeleton } from "@/components/receipt/ArrivalPanel"
import { DocumentStatusNote } from "@/components/receipt/DocumentStatusNote"
import { OrderDocuments } from "@/components/receipt/OrderDocuments"
import { ReceiptDocument, ReceiptDocumentSkeleton } from "@/components/receipt/ReceiptDocument"
import { ResendReceipt } from "@/components/receipt/ResendReceipt"
import { LiveRefresh } from "@/components/live/LiveRefresh"

import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb } from "@/components/ui/misc"
import { Bone, Loading } from "@/components/ui/skeletons"
import { edgeApi, uncached } from "@/lib/api/edge"
import { getSession, requireCustomer } from "@/lib/dal"
import { shortfallsFrom } from "@/lib/fulfillment-progress"
import { formatMoney } from "@/lib/money"
import { orderRowWords } from "@/lib/order-summary"

import { ReorderButton } from "../ReorderButton"

export const metadata: Metadata = {
  title: "Order",
  robots: { index: false, follow: false },
}

/** Order detail: the same document as the checkout receipt (shared components and column), reached from history. */
export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      {/* Re-reads when this order changes; outside Suspense so it is not remounted on each render. */}
      <LiveRefresh />
      <Suspense fallback={<OrderSkeleton />}>
        <OrderDetail params={params} />
      </Suspense>
    </div>
  )
}

const PLACED = new Intl.DateTimeFormat("en-AU", { dateStyle: "long", timeStyle: "short", timeZone: "Australia/Melbourne" })
const TONE = { outline: "outline", default: "default", brand: "brand", secondary: "secondary" } as const

/** One order: where it is and when it is coming, then the receipt; beside them, refunds and reporting a problem. */
async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireCustomer(`/orders/${id}`)
  const session = await getSession()

  let dto: OrderDTO | null = null
  if (session?.accessToken) {
    try {
      dto = await edgeApi(session).get<OrderDTO>(`/commerce/v1/orders/${id}`, uncached())
    } catch (err) {
      if ((err as { status?: number }).status === 404) notFound()
      dto = null
    }
  }
  if (!dto) notFound()

  const paid = dto.status === "paid"
  // The delivery note, once everything has arrived (409 until then, shown as "not yet").
  let note: DeliveryNoteDTO | null = null
  if (paid && session?.accessToken) {
    try {
      note = await edgeApi(session).get<DeliveryNoteDTO>(`/commerce/v1/orders/${id}/delivery-note`, uncached())
    } catch {
      note = null
    }
  }
  const shortfalls = paid ? shortfallsFrom(dto.fulfillments) : []
  const itemCount = dto.items.reduce((n, i) => n + i.quantity, 0)
  // The order list's words for this order (lib/order-summary.ts).
  const words = orderRowWords({
    id: dto.id, orderNumber: dto.orderNumber, status: dto.status, placedAt: dto.placedAt, itemCount,
    grandTotalAmount: dto.grandTotalAmount, currency: dto.currency,
    stage: paid ? dto.stage : undefined, fullyRefunded: dto.fullyRefunded ? true : undefined, delivery: dto.delivery,
  })

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[{ label: "Account", href: "/account" }, { label: "Orders", href: "/orders" }, { label: dto.orderNumber }]}
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Order {dto.orderNumber} <Badge variant={TONE[words.tone]}>{words.badge}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {[
              dto.placedAt ? `Placed ${PLACED.format(new Date(dto.placedAt))}` : null,
              `${itemCount} item${itemCount === 1 ? "" : "s"}`,
              `${formatMoney(dto.grandTotalAmount, dto.currency)}${paid ? " paid" : ""}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {paid && (
          <div className="flex flex-wrap items-start gap-2 print:hidden">
            <ReorderButton orderId={dto.id} />
            <ResendReceipt orderId={dto.id} />
          </div>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* The stage is the server's, as-is. Only a paid order has one. */}
          {paid && <ArrivalPanel stage={dto.stage} arrivals={dto.arrivalEstimates ?? []} delivery={dto.delivery} />}

          {shortfalls.length > 0 ? <Unavailable shortfalls={shortfalls} /> : null}

          <ReceiptDocument order={dto} unavailable={shortfalls.map((s) => s.productName)} buyAgain={paid}>
            <div className="grid gap-6 sm:grid-cols-3 [&>section]:mt-0">
              <OrderAddresses
                shipping={dto.deliveryAddress}
                billing={dto.billingAddress}
                instructions={dto.deliveryInstructions}
              />
            </div>
          </ReceiptDocument>

          {paid ? <OrderDocuments orderId={dto.id} note={note} /> : null}

          <DocumentStatusNote />
        </div>

        <div className="flex flex-col gap-6 print:hidden">
          {/* What has happened to the shopper's money; absent when nothing has. */}
          {dto.refunds?.length ? (
            <RefundBlock
              refunds={dto.refunds}
              refundedTotal={dto.refundedTotal ?? "0.00"}
              amountPaidAfterRefunds={dto.amountPaidAfterRefunds ?? dto.grandTotalAmount}
              fullyRefunded={dto.fullyRefunded ?? false}
            />
          ) : null}

          <section aria-labelledby="order-help" className="flex flex-col gap-4 rounded-lg border bg-card p-6 shadow-xs">
            <div className="flex flex-col gap-2">
              <h2 id="order-help" className="leading-none font-semibold">
                Something wrong with this order?
              </h2>
              <p className="text-sm text-muted-foreground">Tell us what happened and we&apos;ll sort it out.</p>
            </div>
            <div className="flex flex-col items-stretch gap-2">
              {/* Only a paid order can be reported on. */}
              {paid ? (
                <RequestRefund
                  orderId={dto.id}
                  orderNumber={dto.orderNumber}
                  items={dto.items.map((i) => ({
                    orderItemId: i.orderItemId,
                    productName: i.productName,
                    quantity: i.quantity,
                  }))}
                />
              ) : (
                <Link href="/help" className="text-sm font-medium text-primary underline underline-offset-4">
                  Get help
                </Link>
              )}
              {/* The server's verdict; absent, not disabled, when it cannot be cancelled (staff still can). */}
              {dto.cancellable ? <CancelOrder orderId={dto.id} /> : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

/** What a shop could not supply, told once settled. The refund is in the future tense: the money follows. */
function Unavailable({ shortfalls }: { shortfalls: { productName: string; quantity: number }[] }) {
  const one = shortfalls.length === 1
  return (
    <Alert
      variant="muted"
      title={`${one ? "This item was" : "These items were"} out of stock and won't be included:`}
    >
      {shortfalls.map((s) => `${s.productName} × ${s.quantity}`).join(" · ")}. You won&apos;t be charged for{" "}
      {one ? "it" : "them"} - we&apos;ll refund {one ? "it" : "them"} to your original payment method.{" "}
      <Link href="/help" className="underline underline-offset-2">
        Get help
      </Link>{" "}
      if something doesn&apos;t look right.
    </Alert>
  )
}

/** The order while it reads: its breadcrumb, head, arrival panel, receipt and help, each in place. */
function OrderSkeleton() {
  return (
    <Loading label="Loading your order">
      <div className="space-y-6">
        <Breadcrumb items={[{ label: "Account", href: "/account" }, { label: "Orders", href: "/orders" }, { label: "Order" }]} />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Bone kind="title" className="w-64" />
            <Bone className="w-80 max-w-full" />
          </div>
          <Bone kind="control" className="w-32" />
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <ArrivalPanelSkeleton />
            <ReceiptDocumentSkeleton />
          </div>
          <section className="flex flex-col gap-4 rounded-lg border bg-card p-6 shadow-xs">
            <div className="flex flex-col gap-2">
              <h2 className="leading-none font-semibold">Something wrong with this order?</h2>
              <p className="text-sm text-muted-foreground">Tell us what happened and we&apos;ll sort it out.</p>
            </div>
            <Bone kind="control" />
          </section>
        </div>
      </div>
    </Loading>
  )
}
