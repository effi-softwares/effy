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

import { Alert, AlertTitle, Badge, Button, Card, Skeleton } from "@effy/design-system/ui"
import { ErrorState, PackageStatusPill } from "@effy/web-kit/console"
import { DetailRows, PageHeader, Panel, Timeline, TimelineItem } from "@effy/web-kit/patterns"

import { sessionQuery } from "@/features/auth/queries"
import { track } from "@/lib/telemetry"

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
              <Badge variant="destructive">
                <CircleAlert aria-hidden="true" />
                At risk
              </Badge>
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
        <Alert variant={detail.status === "unfulfillable" ? "destructive" : "muted"} role="status">
          <Info aria-hidden="true" />
          <AlertTitle>{note}</AlertTitle>
        </Alert>
      ) : null}

      <div className="ef-detail">
        <div className="ef-detail__main">
          <ItemsAndFulfilment detail={detail} />

          <PackBags detail={detail} />

          <Panel
            title="Internal notes"
            description="Only your team sees notes. They can't be edited once added."
            actions={
              <Button variant="outline" size="sm" onClick={() => setNoteOpen(true)}>
                <Plus aria-hidden="true" />
                Add note
              </Button>
            }
          >
            {detail.notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes on this order yet.</p>
            ) : (
              <Timeline>
                {detail.notes.map((n) => (
                  <TimelineItem
                    key={n.id}
                    icon={<MessageSquare />}
                    title={
                      <span className="flex items-baseline justify-between gap-3">
                        {n.authorLabel || "Your team"}
                        <time
                          className="text-xs font-normal whitespace-nowrap text-muted-foreground"
                          dateTime={n.createdAt}
                        >
                          {formatWhen(n.createdAt)}
                        </time>
                      </span>
                    }
                  >
                    <span className="mt-1 block rounded-lg bg-muted px-3 py-2 whitespace-pre-line text-foreground text-pretty">
                      {n.body}
                    </span>
                  </TimelineItem>
                ))}
              </Timeline>
            )}
          </Panel>
        </div>

        <aside className="ef-detail__aside">
          <Panel
            title="Payment"
            actions={<PaymentPill state={detail.payment.state} />}
            footer={
              refundable || canDeclareUnfulfillable(detail.status) ? (
                <div className="grid w-full gap-2">
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
              ) : undefined
            }
          >
            <div className="grid gap-3">
              <DetailRows
                tight
                rows={[
                  {
                    label: "Your items",
                    value: <span className="tabular-nums">{formatMoney(detail.money.shopSubtotal, currency)}</span>,
                  },
                  {
                    label: "Refunded",
                    value: <span className="tabular-nums">{formatMoney(detail.money.refunded, currency)}</span>,
                  },
                  {
                    label: "Net",
                    value: (
                      <span className="font-semibold tabular-nums">{formatMoney(detail.money.net, currency)}</span>
                    ),
                  },
                ]}
              />
              <p className="text-sm text-muted-foreground">
                {paymentMethodText(detail.payment)} · {formatMoney(detail.payment.amount, currency)} captured at
                checkout
              </p>
            </div>
          </Panel>

          <Panel
            flush
            title="Customer and delivery"
            description={`${deliveredByText(detail.deliveredBy)} · ready by ${formatWhen(detail.readyBy)}`}
          >
            <div className="px-5 py-2">
              <DetailRows
                tight
                rows={[
                  {
                    label: "Customer",
                    value: (
                      <>
                        <div className="font-medium">{detail.delivery.recipientName || "—"}</div>
                        {detail.delivery.phone ? (
                          <a
                            href={`tel:${detail.delivery.phone}`}
                            className="text-muted-foreground no-underline hover:underline"
                          >
                            {detail.delivery.phone}
                          </a>
                        ) : null}
                      </>
                    ),
                  },
                  { label: "Ship to", value: <span className="whitespace-pre-line">{addressText(detail)}</span> },
                  {
                    label: "Bill to",
                    value: <span className="text-muted-foreground">Held by Effy with the payment.</span>,
                  },
                  {
                    label: "Tags",
                    value: (
                      <span className="flex flex-wrap items-center gap-2">
                        {detail.tags.length > 0 ? (
                          detail.tags.map((t) => (
                            <Badge key={t} variant="outline">
                              {t}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">No tags.</span>
                        )}
                        <Button variant="link" className="ml-auto" onClick={() => setTagsOpen(true)}>
                          Edit
                        </Button>
                      </span>
                    ),
                  },
                ]}
              />
            </div>
            {detail.courierPickup ? (
              <div className="border-t">
                <CourierPickup fulfillmentId={detail.id} status={detail.status} pickup={detail.courierPickup} />
              </div>
            ) : null}
          </Panel>
        </aside>
      </div>

      {nextTransition(detail.status) || detail.status === "ready_for_pickup" ? (
        <div className="ef-actionbar">
          <div className="ef-actionbar__text">
            <div className="ef-actionbar__title">
              {detail.status === "ready_for_pickup"
                ? "Ready — waiting for collection"
                : toGo > 0
                  ? `${toGo} ${toGo === 1 ? "line" : "lines"} to go`
                  : "Every line is accounted for"}
            </div>
            <div className="ef-actionbar__desc">
              {detail.status === "ready_for_pickup"
                ? `${detail.deliveredBy === "courier" ? "A courier" : "An Effy driver"} collects it. Reopen picking only if something has to change.`
                : `When every line is picked and every bag labelled, mark it ready. ${detail.deliveredBy === "courier" ? "A courier" : "The Effy driver"} collects it.`}
            </div>
          </div>
          <div className="ef-actionbar__actions">
            <StateActions detail={detail} />
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
      <div className="ef-detail">
        <div className="ef-detail__main">
          <Card className="gap-0 py-0">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="pick">
                <Skeleton className="size-11 rounded-lg" />
                <Skeleton className="pick__img" />
                <div className="grid gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
                <Skeleton className="h-6 w-10" />
              </div>
            ))}
          </Card>
        </div>
        <div className="ef-detail__aside">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
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
