import { useEffect, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { CalendarClock, Calendar, CreditCard, Eye, History, List, Package, ReceiptText, Truck } from "lucide-react"

import { Badge, Button, Skeleton, Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@effy/design-system/ui"
import { leastAdvanced, type PackageStatusView } from "@effy/shared-types"
import { ErrorState, PackageStatusPill, useHeaderDetail } from "@effy/web-kit/console"

import { PageHeader, Panel, Callout } from "@effy/web-kit/patterns"
import { AssignmentActions } from "@/features/assign/AssignmentActions"
import { sessionQuery } from "@/features/auth/queries"
import { canDispatch } from "@/features/dispatch/access"
import { moment, money } from "@/lib/format"

import { canRecordOrderProgress } from "./access"
import { DeliveryInstructions } from "./components/DeliveryInstructions"
import { DeliveryTypeSection, type DeliveryMove } from "./components/DeliveryTypeSection"
import { PackageRows } from "./components/PackageRows"
import { RefundsSection } from "./components/RefundsSection"
import { orderActionError } from "./errorText"
import { OrderCustomerPanel } from "./components/OrderCustomerPanel"
import { OrderHistoryPanel } from "./components/OrderHistoryPanel"
import { OrderItemsPanel } from "./components/OrderItemsPanel"
import { OrderPaymentPanel } from "./components/OrderPaymentPanel"
import { deliveryTypeText, isPaid, STAGE_LABEL, type OrderDetail } from "./model"
import { orderDetailQuery, useRecordArrival, useRecordHandoff } from "./queries"

type Section = "packages" | "items" | "payment" | "refunds" | "history"

function AddressBlock({ title, address }: { title: string; address: Record<string, unknown> | null }) {
  return (
    <div className="space-y-1">
      <div className="ef-eyebrow">{title}</div>
      <address className="text-sm not-italic">
        {addressLines(address).map((line) => (
          <div key={line}>{line}</div>
        ))}
      </address>
    </div>
  )
}

function addressLines(a: Record<string, unknown> | null): string[] {
  if (!a) return []
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "")
  return [
    s("recipientName"),
    [s("line1"), s("line2")].filter(Boolean).join(", "),
    [s("city"), s("region"), s("postalCode")].filter(Boolean).join(" "),
    s("country"),
  ].filter(Boolean)
}

const newChangeId = () => crypto.randomUUID()

export function OrderDetailScreen({
  orderId,
  highlight,
}: {
  orderId: string
  highlight?: { parcelId?: string; packageId?: string }
}) {
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const canRecord = canRecordOrderProgress(roles)
  const mayAssign = canDispatch(roles)

  const { data, error, isPending, isError, refetch } = useQuery(orderDetailQuery(orderId))
  const target = highlight?.parcelId
    ? `parcel-${highlight.parcelId}`
    : highlight?.packageId
      ? `package-${highlight.packageId}`
      : null
  useEffect(() => {
    if (!target || !data) return
    document.getElementById(target)?.scrollIntoView?.({ block: "center", behavior: "smooth" })
  }, [target, data])
  const handoff = useRecordHandoff(orderId)
  const arrival = useRecordArrival(orderId)
  const [actionError, setActionError] = useState<string | null>(null)
  const [section, setSection] = useState<Section>("packages")
  const [moving, setMoving] = useState<DeliveryMove | null>(null)
  useHeaderDetail(data?.orderNumber)

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isPending) return <DetailSkeleton />

  const order: OrderDetail = data
  const busy = handoff.isPending || arrival.isPending
  const views = order.packages
    .map((p) => p.statusView)
    .filter((v): v is PackageStatusView => v !== null && v !== undefined)
  const status = leastAdvanced(views)
  const openRequest = order.refundRequest && order.refundRequest.status === "open" ? order.refundRequest : null
  const movable = canRecord && order.status === "paid" && order.deliveryType !== null

  const onHandoff = (fulfillmentId: string, reference: string, carrierName: string) => {
    setActionError(null)
    handoff.mutate(
      { fulfillmentId, body: { reference, carrierName, changeId: newChangeId() } },
      { onError: (e) => setActionError(orderActionError(e, "handoff")) },
    )
  }
  const onArrival = (fulfillmentId: string) => {
    setActionError(null)
    arrival.mutate(
      { fulfillmentId, body: { changeId: newChangeId() } },
      { onError: (e) => setActionError(orderActionError(e, "arrival")) },
    )
  }

  return (
    <>
      <PageHeader
        back={{ label: "Orders", link: { to: "/orders" } }}
        title={
          <>
            <span className="ef-code text-2xl font-semibold">{order.orderNumber}</span>
            {status ? <PackageStatusPill view={status} showDetail={false} icons /> : null}
            <Badge variant={order.deliveryType === "effy" ? "success" : "secondary"}>
              {deliveryTypeText(order.deliveryType)}
            </Badge>
          </>
        }
        meta={
          <>
            <span>
              <Calendar aria-hidden="true" />
              Placed {moment(order.placedAt).replace(/^(\w)/, (c) => c.toLowerCase())}
            </span>
            <span>
              <Eye aria-hidden="true" />
              Customer sees: {STAGE_LABEL[order.stage] ?? order.stage}
              {order.finished ? " · Complete" : ""}
            </span>
            <span>
              <CreditCard aria-hidden="true" />
              {money(order.grandTotalAmount, order.currency)} {isPaid(order) ? "paid" : `· ${order.paymentStatus}`}
            </span>
          </>
        }
        actions={
          <>
            {movable && order.deliveryType === "effy" ? (
              <Button variant="outline" onClick={() => setMoving("retime")}>
                <CalendarClock aria-hidden="true" />
                Change day or time…
              </Button>
            ) : null}
            {movable ? (
              <Button variant="outline" onClick={() => setMoving(order.deliveryType === "effy" ? "courier" : "effy")}>
                {order.deliveryType === "effy" ? <Truck aria-hidden="true" /> : <Package aria-hidden="true" />}
                {order.deliveryType === "effy" ? "Send by courier…" : "Deliver by Effy…"}
              </Button>
            ) : null}
            {canRecord ? (
              <Button variant="outline" onClick={() => setSection("refunds")}>
                <ReceiptText aria-hidden="true" />
                Issue a refund…
              </Button>
            ) : null}
          </>
        }
      />

      {actionError ? <Callout tone="destructive" title={actionError} /> : null}

      {openRequest ? (
        <Callout tone="info" title="The customer has asked for a refund">
          “{openRequest.message}” Decide it under Refunds — issuing a refund closes the request.
        </Callout>
      ) : null}

      <div className="ef-detail">
        <div className="ef-detail__main">
          <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
            <div className="ef-tabsbar">
              <div className="ef-tabsbar__list">
                <TabsList aria-label="Order sections">
                  <TabsTrigger value="packages">
                    <Package aria-hidden="true" />
                    Packages
                    <TabsCount>{order.packages.length}</TabsCount>
                  </TabsTrigger>
                  <TabsTrigger value="items">
                    <List aria-hidden="true" />
                    Items
                    <TabsCount>{order.items.reduce((n, i) => n + i.quantity, 0)}</TabsCount>
                  </TabsTrigger>
                  <TabsTrigger value="payment">
                    <CreditCard aria-hidden="true" />
                    Payment
                  </TabsTrigger>
                  <TabsTrigger value="refunds">
                    <ReceiptText aria-hidden="true" />
                    Refunds
                    {order.refunds.length > 0 || openRequest || order.proposedRefunds.length > 0 ? (
                      <TabsCount>
                        {order.refunds.length + (openRequest ? 1 : 0) + order.proposedRefunds.length}
                      </TabsCount>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <History aria-hidden="true" />
                    History
                  </TabsTrigger>
                </TabsList>
              </div>
              <span className="text-xs text-muted-foreground max-md:hidden">Live — updates as packages move</span>
            </div>

            <TabsContent value="packages" className="ef-tabpanel">
              <Panel
                title={
                  <>
                    Packages <span className="font-normal text-muted-foreground">· {order.packages.length}</span>
                  </>
                }
                icon={<Package aria-hidden="true" />}
                description="Each package is packed by one shop and moves on its own. The customer only ever sees one order."
                flush
              >
                <PackageRows
                  highlight={highlight}
                  orderId={order.id}
                  courierCollection={order.courierCollection}
                  packages={order.packages}
                  canRecord={canRecord}
                  busy={busy}
                  onHandoff={onHandoff}
                  onArrival={onArrival}
                  renderActions={
                    mayAssign
                      ? (pkg, stage, assignment) => (
                          <AssignmentActions
                            packageId={pkg.fulfillmentId}
                            stage={stage}
                            assignment={assignment}
                            title={`${order.orderNumber} · ${pkg.shopName} · ${stage === "collection" ? "collection" : "delivery"}`}
                          />
                        )
                      : undefined
                  }
                />
                {!canRecord ? (
                  <p className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
                    Recording a handover or an arrival needs a manager or administrator.
                  </p>
                ) : null}
              </Panel>
            </TabsContent>

            <TabsContent value="items" className="ef-tabpanel">
              <OrderItemsPanel order={order} />
            </TabsContent>

            <TabsContent value="payment" className="ef-tabpanel">
              <OrderPaymentPanel order={order} />
            </TabsContent>

            <TabsContent value="refunds" className="ef-tabpanel">
              <Panel
                title="Refunds"
                icon={<ReceiptText aria-hidden="true" />}
                description={`${money(order.refundableAmount, order.currency)} refundable · ${
                  Number(order.refundedAmount) > 0
                    ? `${money(order.refundedAmount, order.currency)} refunded`
                    : "nothing refunded yet"
                }`}
              >
                <RefundsSection order={order} canIssue={canRecord} />
              </Panel>
            </TabsContent>

            <TabsContent value="history" className="ef-tabpanel">
              <OrderHistoryPanel history={order.history} />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="ef-detail__aside is-first">
          <OrderCustomerPanel order={order} />

          <DeliveryTypeSection
            order={order}
            formatDateTime={moment}
            canChangeCollection={canRecord}
            canMove={canRecord}
            moving={moving}
            onMovingChange={setMoving}
          >
            <AddressBlock title="Delivering to" address={order.deliveryAddress} />
            <DeliveryInstructions instructions={order.deliveryInstructions} />
            {order.billingAddress ? (
              <AddressBlock title="Billing" address={order.billingAddress} />
            ) : (
              <p className="text-xs text-muted-foreground">Billing: same as delivery.</p>
            )}
          </DeliveryTypeSection>
        </aside>
      </div>
    </>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="ef-detail">
        <div className="ef-detail__main">
          <Skeleton className="h-9 w-96 max-w-full" />
          <Skeleton className="h-64" />
        </div>
        <div className="ef-detail__aside">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  )
}
