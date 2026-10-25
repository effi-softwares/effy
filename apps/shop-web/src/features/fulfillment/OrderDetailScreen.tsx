import { useEffect, useState } from "react"

import { isShopManager } from "@effy/shared-types"
import { useQuery } from "@tanstack/react-query"

import {
  CalendarDays,
  CircleAlert,
  History,
  Info,
  MessageSquare,
  Package,
  Plus,
  Printer,
  ReceiptText,
  Truck,
} from "lucide-react"

import { Button, Skeleton } from "@effy/design-system/ui"
import { ErrorState, PackageStatusPill } from "@effy/web-kit/console"
import { PageHeader } from "@effy/web-kit/patterns"

import { sessionQuery } from "@/features/auth/queries"
import { track } from "@/lib/telemetry"
import { cn } from "@/lib/utils"

import { CourierPickup } from "./components/CourierPickup"
import { ItemsAndFulfilment } from "./components/ItemsAndFulfilment"
import { OrderActivitySheet } from "./components/OrderActivitySheet"
import { OrderNoteDialog, OrderTagsDialog } from "./components/OrderNotesAndTags"
import { PaymentPill } from "./components/OrderPill"
import { PackBags } from "./components/PackBags"
import { RefundSheet } from "./components/RefundSheet"
import { CantSupplyDialog, StateActions, stateNote } from "./components/StateControl"
import { canDeclareUnfulfillable, nextTransition } from "./model"
import {
  formatMoney,
  formatWhen,
  deliveredByText,
  paymentMethodText,
  pickModeOf,
  refundableQuantity,
  type OrderDetail,
} from "./orderConsole"
import { collectionLine } from "./collection"
import { printPickLists } from "./pickList"
import { orderDetailQuery } from "./queries"

export function OrderDetailScreen({ fulfillmentId }: { fulfillmentId: string }) {
  const { data, error, isPending, isError, refetch } = useQuery(orderDetailQuery(fulfillmentId))
  const { data: session } = useQuery(sessionQuery)
  const [activityOpen, setActivityOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)

  const openedStatus = data?.status
  useEffect(() => {
    if (!openedStatus) return
    track({ name: "shop_order_opened", fulfillmentId, status: openedStatus })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per portion, not per status change
  }, [fulfillmentId])

  // A courtesy, not the gate. The backend decides from the platform record.
  const canRefund = session?.status === "signed-in" && isShopManager(session.identity.roles)

  if (isError) {
    return (
      <ErrorState
        error={error}
        onRetry={() => void refetch()}
        forbiddenMessage="This order isn't available to your shop."
      />
    )
  }
  if (isPending) {
    return <DetailSkeleton />
  }

  const detail: OrderDetail = data
  const currency = detail.money.currency
  const refundable = canRefund && detail.lines.some((l) => refundableQuantity(l) > 0)
  const units = detail.lines.reduce((n, l) => n + l.orderedQuantity, 0)
  const toGo = detail.lines.filter((l) => pickModeOf(l) === "none").length
  const note = stateNote(detail.status)

  return (
    <div className="flex min-w-0 flex-col gap-6 max-md:gap-4">
      <PageHeader
        back={{ label: "Orders", link: { to: "/orders" } }}
        title={
          <>
            <span className="font-mono tracking-[-.02em]">{detail.orderNumber}</span>
            <PackageStatusPill view={detail.statusView} />
            {detail.atRisk ? (
              <span className="bo-st bo-st--problem">
                <CircleAlert aria-hidden="true" />
                At risk
              </span>
            ) : null}
          </>
        }
        meta={
          <>
            <span>
              <CalendarDays aria-hidden="true" />
              {formatWhen(detail.placedAt)} · Online store ·{" "}
              <span className="font-mono" aria-label="Package code">
                {detail.parcels[0]?.code}
              </span>
            </span>
            <span>
              <Package aria-hidden="true" />
              {units} {units === 1 ? "item" : "items"}
            </span>
            <span>
              <Truck aria-hidden="true" />
              Goes with {detail.deliveredBy === "courier" ? "a courier" : "an Effy driver"}
            </span>
            {detail.readyBy ? (
              <span>
                Ready by {formatWhen(detail.readyBy)}
                {detail.collection ? ` · ${collectionLine(detail.collection)}` : null}
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setActivityOpen(true)}>
              <History aria-hidden="true" />
              Activity
            </Button>
            <Button variant="outline" onClick={() => printPickList(detail)}>
              <Printer aria-hidden="true" />
              Print pick list
            </Button>
          </>
        }
      />

      {note ? (
        <div
          className={cn("bo-alert", detail.status === "unfulfillable" ? "bo-alert--destructive" : "bo-alert--muted")}
          role="status"
        >
          <Info aria-hidden="true" />
          <div className="bo-alert__title">{note}</div>
        </div>
      ) : null}

      <div className="bo-detail">
        <div className="bo-detail__main">
          <ItemsAndFulfilment detail={detail} />

          <PackBags detail={detail} />

          <section className="bo-panel">
            <div className="bo-panel__head">
              <div className="min-w-0 flex-1">
                <h2 className="bo-panel__title">Internal notes</h2>
                <p className="bo-panel__desc">Only your team sees notes. They can&apos;t be edited once added.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setNoteOpen(true)}>
                <Plus aria-hidden="true" />
                Add note
              </Button>
            </div>
            <div className="bo-panel__body">
              {detail.notes.length === 0 ? (
                <p className="text-muted-foreground">No notes on this order yet.</p>
              ) : (
                <ul className="bo-tl">
                  {detail.notes.map((n) => (
                    <li key={n.id} className="bo-tl__item">
                      <span className="bo-tl__mark" aria-hidden="true">
                        <MessageSquare />
                      </span>
                      <div className="min-w-0">
                        <div className="bo-tl__title">{n.authorLabel || "Your team"}</div>
                        <div className="bo-tl__note whitespace-pre-line text-pretty">{n.body}</div>
                      </div>
                      <time className="bo-tl__time" dateTime={n.createdAt}>
                        {formatWhen(n.createdAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <aside className="bo-detail__aside">
          <section className="bo-panel">
            <div className="bo-panel__head">
              <h2 className="bo-panel__title">Payment</h2>
              <PaymentPill state={detail.payment.state} />
            </div>
            <div className="bo-panel__body grid gap-3">
              <dl className="bo-dl bo-dl--tight">
                <div className="bo-dl__row">
                  <dt>Your items</dt>
                  <dd className="tabular-nums">{formatMoney(detail.money.shopSubtotal, currency)}</dd>
                </div>
                <div className="bo-dl__row">
                  <dt>Refunded</dt>
                  <dd className="tabular-nums">{formatMoney(detail.money.refunded, currency)}</dd>
                </div>
                <div className="bo-dl__row">
                  <dt>Net</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(detail.money.net, currency)}</dd>
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">
                {paymentMethodText(detail.payment)} · {formatMoney(detail.payment.amount, currency)} captured at
                checkout
              </p>
            </div>
            {refundable || canDeclareUnfulfillable(detail.status) ? (
              <div className="bo-panel__foot grid! justify-stretch!">
                {refundable ? (
                  <Button variant="outline" onClick={() => setRefundOpen(true)}>
                    <ReceiptText aria-hidden="true" />
                    Refund
                  </Button>
                ) : null}
                {canDeclareUnfulfillable(detail.status) ? (
                  <Button variant="ghost" onClick={() => setCancelOpen(true)}>
                    Can&apos;t supply it…
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="bo-panel">
            <div className="bo-panel__head">
              <div className="min-w-0 flex-1">
                <h2 className="bo-panel__title">Customer and delivery</h2>
                <p className="bo-panel__desc">
                  {deliveredByText(detail.deliveredBy)} · ready by {formatWhen(detail.readyBy)}
                </p>
              </div>
            </div>
            <div className="bo-panel__body">
              <dl className="bo-dl bo-dl--tight">
                <div className="bo-dl__row">
                  <dt>Customer</dt>
                  <dd>
                    <div className="font-medium">{detail.delivery.recipientName || "—"}</div>
                    {detail.delivery.phone ? (
                      <a
                        href={`tel:${detail.delivery.phone}`}
                        className="text-muted-foreground no-underline hover:underline"
                      >
                        {detail.delivery.phone}
                      </a>
                    ) : null}
                  </dd>
                </div>
                <div className="bo-dl__row">
                  <dt>Ship to</dt>
                  <dd className="whitespace-pre-line">{addressText(detail)}</dd>
                </div>
                <div className="bo-dl__row">
                  <dt>Bill to</dt>
                  <dd className="text-muted-foreground">Held by Effy with the payment.</dd>
                </div>
                <div className="bo-dl__row">
                  <dt>Tags</dt>
                  <dd className="flex flex-wrap items-center gap-1.5">
                    {detail.tags.length > 0 ? (
                      detail.tags.map((t) => (
                        <span key={t} className="bo-tag">
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-foreground">No tags.</span>
                    )}
                    <Button variant="link" className="ml-auto" onClick={() => setTagsOpen(true)}>
                      Edit
                    </Button>
                  </dd>
                </div>
              </dl>
            </div>
            {detail.courierPickup ? (
              <div className="border-t border-border">
                <CourierPickup fulfillmentId={detail.id} status={detail.status} pickup={detail.courierPickup} />
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      {nextTransition(detail.status) || detail.status === "ready_for_pickup" ? (
        <div className="sh-actionbar">
          <div className="sh-actionbar__text">
            <div className="sh-actionbar__title">
              {detail.status === "ready_for_pickup"
                ? "Ready — waiting for collection"
                : toGo > 0
                  ? `${toGo} ${toGo === 1 ? "line" : "lines"} to go`
                  : "Every line is accounted for"}
            </div>
            <div className="sh-actionbar__desc">
              {detail.status === "ready_for_pickup"
                ? `${detail.deliveredBy === "courier" ? "A courier" : "An Effy driver"} collects it. Reopen picking only if something has to change.`
                : `When every line is picked and every bag labelled, mark it ready. ${detail.deliveredBy === "courier" ? "A courier" : "The Effy driver"} collects it.`}
            </div>
          </div>
          <div className="sh-actionbar__actions">
            <StateActions detail={detail} size="lg" />
          </div>
        </div>
      ) : null}

      <OrderActivitySheet fulfillmentId={detail.id} open={activityOpen} onOpenChange={setActivityOpen} />
      <CantSupplyDialog targets={[detail]} open={cancelOpen} onOpenChange={setCancelOpen} />
      <OrderTagsDialog fulfillmentId={detail.id} tags={detail.tags} open={tagsOpen} onOpenChange={setTagsOpen} />
      <OrderNoteDialog fulfillmentId={detail.id} open={noteOpen} onOpenChange={setNoteOpen} />
      {canRefund ? (
        <RefundSheet
          detail={{
            id: detail.id,
            orderId: detail.orderId,
            orderNumber: detail.orderNumber,
            currency,
            lines: detail.lines,
          }}
          open={refundOpen}
          onOpenChange={setRefundOpen}
        />
      ) : null}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading order">
      <div className="grid gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="bo-detail">
        <div className="bo-detail__main">
          <div className="bo-panel">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="sh-pick">
                <Skeleton className="size-11 rounded-[10px]" />
                <Skeleton className="sh-pick__img" />
                <div className="grid gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3.5 w-1/3" />
                </div>
                <Skeleton className="h-6 w-10" />
              </div>
            ))}
          </div>
        </div>
        <div className="bo-detail__aside">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}

function addressText(detail: OrderDetail): string {
  const d = detail.delivery
  return [d.recipientName, d.line1, d.line2, [d.city, d.region, d.postalCode].filter(Boolean).join(" "), d.country]
    .filter(Boolean)
    .join("\n")
}

function printPickList(detail: OrderDetail) {
  printPickLists(
    [
      {
        orderNumber: detail.orderNumber,
        recipientName: detail.delivery.recipientName,
        deliveredBy: detail.deliveredBy,
        readyBy: detail.readyBy,
        lines: detail.lines.map((l) => ({
          name: l.name,
          variantLabel: l.variantLabel,
          variantCode: l.variantCode,
          sku: l.sku,
          quantity: l.orderedQuantity,
          storageClass: l.storageClass,
        })),
      },
    ],
    `Pick list ${detail.orderNumber}`,
  )
}
