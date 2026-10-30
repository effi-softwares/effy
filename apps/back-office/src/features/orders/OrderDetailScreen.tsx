import { useEffect, useState } from "react"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useHotkey } from "@tanstack/react-hotkeys"
import {
  Box,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Coins,
  Copy,
  CreditCard,
  Hash,
  List,
  Mail,
  MapPin,
  MessageSquareQuote,
  Package,
  ReceiptText,
  Route,
  Search,
  Store,
  Tag,
  Truck,
  User,
} from "lucide-react"

import { Avatar, AvatarFallback, Badge, Button, toast } from "@effy/design-system/ui"
import { leastAdvanced, STATUS_WORD, type PackageStatusView } from "@effy/shared-types"
import { ActionBarButton, useActionBar, useActionBarDensity } from "@effy/web-kit/action-bar"
import { ActivityLogDrawer, useActivityAction } from "@effy/web-kit/activity-log"
import { ErrorState, PackageStatusPill, useHeaderDetail } from "@effy/web-kit/console"
import { listQueryOptions, useListNeighbours } from "@effy/web-kit/data-table"
import {
  BannerStack,
  InspectorRows,
  InspectorSection,
  MoreActions,
  RecordFacts,
  RecordHeader,
  RecordNav,
  RecordPage,
  RecordPageSkeleton,
  RecordSection,
  type BannerStackItem,
} from "@effy/web-kit/patterns"

import { initialsOf } from "@/components/shell/identity"
import { AssignmentActions } from "@/features/assign/AssignmentActions"
import { sessionQuery } from "@/features/auth/queries"
import { OrderCustomerPoints } from "@/features/customers/components/OrderCustomerPoints"
import { canDispatch } from "@/features/dispatch/access"
import { api } from "@/lib/api"
import { moment } from "@/lib/format"

import { canRecordOrderProgress } from "./access"
import { CustomerOrderPreview } from "./components/CustomerOrderPreview"
import { DeliveryInstructions } from "./components/DeliveryInstructions"
import { DeliveryTypeSection, type DeliveryMove } from "./components/DeliveryTypeSection"
import { FeeBreakdown } from "./components/FeeBreakdown"
import { OrderItemsSection, refundableOf } from "./components/OrderItemsSection"
import { PackageRows } from "./components/PackageRows"
import { RefundsSection } from "./components/RefundsSection"
import { orderActionError } from "./errorText"
import { ORDERS_LIST_KEY, ordersList } from "./list"
import { aud, CUSTOMER_STAGES, deliveryTypeText, isPaid, nextActionFor, promiseTextFor, type OrderDetail } from "./model"
import { orderDetailQuery, ordersKeys, useRecordArrival, useRecordHandoff } from "./queries"
import { fetchOrderPage } from "./repo"

const BACK = { label: "Orders", link: { to: "/orders" } } as const

const SECTIONS = [
  { id: "packages", icon: Package, title: "Packages" },
  { id: "items", icon: List, title: "Items" },
  { id: "delivery", icon: Truck, title: "Delivery" },
  { id: "payment", icon: CreditCard, title: "Payment & refunds" },
] as const

const newChangeId = () => crypto.randomUUID()
const goTo = (id: string) => document.getElementById(id)?.scrollIntoView?.({ block: "start" })

export function OrderDetailScreen({
  orderId,
  highlight,
}: {
  orderId: string
  highlight?: { parcelId?: string; packageId?: string }
}) {
  // The order on screen stays while the next one reads: stepping through orders never flashes a skeleton.
  const q = useQuery({ ...orderDetailQuery(orderId), placeholderData: keepPreviousData })
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  if (q.isPending) {
    return (
      <RecordPageSkeleton
        label="Loading order"
        railTitle="About this order"
        back={BACK}
        facts={["Total", "Delivery", "Packages", "Customer sees", "Refunds"]}
        sections={SECTIONS}
        rail={["What the customer sees", "Customer", "Order facts"]}
      />
    )
  }
  return <OrderPage key={q.data.id} order={q.data} highlight={highlight} />
}

function OrderPage({ order, highlight }: { order: OrderDetail; highlight?: { parcelId?: string; packageId?: string } }) {
  const navigate = useNavigate()
  useHeaderDetail(order.orderNumber)
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const canRecord = canRecordOrderProgress(roles)
  const mayAssign = canDispatch(roles)
  const activity = useActivityAction()

  const handoff = useRecordHandoff(order.id)
  const arrival = useRecordArrival(order.id)
  const [actionError, setActionError] = useState<string | null>(null)
  const [moving, setMoving] = useState<DeliveryMove | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [seed, setSeed] = useState<{ lines: Record<string, number>; version: number } | undefined>()

  // Opened from a scan: bring the bag (or package) into view.
  const target = highlight?.parcelId ? `parcel-${highlight.parcelId}` : highlight?.packageId ? `package-${highlight.packageId}` : null
  useEffect(() => {
    if (target) document.getElementById(target)?.scrollIntoView?.({ block: "center" })
  }, [target])

  // Where it sits in the list it was opened from, and its neighbours.
  const nb = useListNeighbours<{ id: string }>({
    key: ORDERS_LIST_KEY,
    id: order.id,
    rowId: (r) => r.id,
    fallback: listQueryOptions({ key: ORDERS_LIST_KEY, list: ordersList, view: ordersList.initial(), cursor: null, fetch: fetchOrderPage }),
  })
  const open = (id: string) => void navigate({ to: "/orders/$orderId", params: { orderId: id } })
  useHotkey("ArrowLeft", () => nb.prev && open(nb.prev), { ignoreInputs: true })
  useHotkey("ArrowRight", () => nb.next && open(nb.next), { ignoreInputs: true })

  const busy = handoff.isPending || arrival.isPending
  const views = order.packages.map((p) => p.statusView).filter((v): v is PackageStatusView => !!v)
  const status = leastAdvanced(views)
  const request = order.refundRequest?.status === "open" ? order.refundRequest : null
  const movable = canRecord && order.status === "paid" && order.deliveryType !== null
  const units = order.items.reduce((n, i) => n + i.quantity, 0)
  const stage = CUSTOMER_STAGES.find((s) => s.stage === order.stage)
  const problems = order.packages.filter((p) => p.statusView?.status === "problem")
  const late = order.packages.filter((p) => p.late && p.statusView?.status !== "problem")
  const toHand = order.packages.find((p) => nextActionFor(p) !== "none")
  const packed = order.packages.filter((p) => p.statusView && p.statusView.status !== "preparing").length

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
  // Refund: from ticked lines, from the customer's request, or from scratch — the one refund form, filled in.
  const refund = (lines: Record<string, number> = {}) => {
    setSeed((s) => ({ lines, version: (s?.version ?? 0) + 1 }))
    setSelected(new Set())
    requestAnimationFrame(() => goTo("refund"))
  }

  const notices: BannerStackItem[] = [
    ...(actionError ? [{ key: "error", tone: "problem" as const, icon: CircleAlert, title: actionError }] : []),
    ...problems.map((p) => ({
      key: `problem:${p.fulfillmentId}`,
      tone: "problem" as const,
      icon: CircleAlert,
      title: `${p.shopName}’s package: ${p.statusView?.detail ?? "a problem"}`,
      children: <p>Its journey under Packages shows where it stopped. Every bag has to be accounted for before it moves on.</p>,
    })),
    ...(request
      ? [
          {
            key: "request",
            icon: MessageSquareQuote,
            title: "The customer asked for a refund",
            children: (
              <>
                <p>{moment(request.createdAt)}</p>
                <blockquote className="mt-2 border-l-2 border-current/50 pl-3 break-words whitespace-pre-line">
                  {request.message}
                </blockquote>
              </>
            ),
          },
        ]
      : []),
    ...(order.proposedRefunds.length > 0
      ? [
          {
            key: "owed",
            icon: ReceiptText,
            title: `A refund looks owed: ${order.proposedRefunds.map((p) => `${p.quantity} × ${p.productName}`).join(", ")}`,
            children: <p>The shop couldn’t supply it. Issue it or dismiss it under Payment &amp; refunds.</p>,
          },
        ]
      : []),
    ...late.map((p) => ({
      key: `late:${p.fulfillmentId}`,
      tone: "problem" as const,
      icon: CalendarClock,
      title: `${p.shopName}’s package is late`,
      children: <p>{p.dueOut ? "It is past its courier pickup." : "It may miss the day it was promised."}</p>,
    })),
  ]

  const first = order.packages[0]
  const promise = order.deliveryType === "courier" ? order.courierEstimate : first ? promiseTextFor(first) : null

  return (
    <RecordPage
      railTitle="About this order"
      rail={
        <>
          <InspectorSection title="What the customer sees" actions={<span className="text-[13px] text-muted-foreground">{stage?.label}</span>}>
            <CustomerOrderPreview order={order} />
          </InspectorSection>
          <InspectorSection
            title="Customer"
            actions={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/customers/$customerId" params={{ customerId: order.customerId }}>
                  Open
                </Link>
              </Button>
            }
          >
            <div className="mb-3 flex items-center gap-3">
              <Avatar aria-hidden="true" className="size-10">
                <AvatarFallback className="bg-primary-muted text-primary">{initialsOf(order.customerName ?? order.customerEmail)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate font-semibold">{order.customerName ?? order.customerEmail}</div>
                <div className="text-[13px] text-muted-foreground">
                  {order.customerOrderCount === 1 ? "Their first order" : `${order.customerOrderCount} orders`}
                </div>
              </div>
            </div>
            <InspectorRows
              rows={[
                { key: "email", icon: Mail, label: "Email", value: <a href={`mailto:${order.customerEmail}`} className="link">{order.customerEmail}</a> },
                ...(typeof order.deliveryAddress.city === "string"
                  ? [{ key: "area", icon: MapPin, label: "Suburb", value: [order.deliveryAddress.city, order.deliveryAddress.postalCode].filter(Boolean).join(" ") }]
                  : []),
              ]}
            />
            <div className="mt-3">
              <OrderCustomerPoints
                customerId={order.customerId}
                customerName={order.customerName ?? order.customerEmail}
                orderId={order.id}
                orderNumber={order.orderNumber}
                layout="block"
              />
            </div>
          </InspectorSection>
          <InspectorSection title="Order facts">
            <InspectorRows
              rows={[
                { key: "placed", icon: CalendarDays, label: "Placed", value: moment(order.placedAt ?? order.createdAt) },
                { key: "number", icon: Hash, label: "Order", value: <span className="font-mono">{order.orderNumber}</span> },
                ...(order.promoCode
                  ? [{ key: "promo", icon: Tag, label: "Promotion", value: <span className="font-mono">{order.promoCode}</span> }]
                  : []),
                ...(order.paymentSplit
                  ? [{ key: "points", icon: Coins, label: "Points", value: `${order.paymentSplit.pointsUsed.toLocaleString("en-AU")} used` }]
                  : []),
                {
                  key: "shops",
                  icon: Store,
                  label: order.packages.length === 1 ? "Shop" : "Shops",
                  value: (
                    <span className="flex flex-wrap gap-x-2">
                      {order.packages.map((p) => (
                        <Link key={p.shopId} to="/shops/$shopId" params={{ shopId: p.shopId }} className="link">
                          {p.shopName}
                        </Link>
                      ))}
                    </span>
                  ),
                },
              ]}
            />
          </InspectorSection>
          {/* Room for the action bar, which floats over the rail's foot too. */}
          <div aria-hidden="true" className="h-20 flex-none" />
        </>
      }
    >
      <RecordHeader
        back={BACK}
        media={<ItemCollage order={order} />}
        eyebrow={deliveryTypeText(order.deliveryType)}
        title={
          <>
            <span className="font-mono tracking-[-.03em]">{order.orderNumber}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy order number"
              onClick={() => void navigator.clipboard?.writeText(order.orderNumber).then(() => toast(`Copied ${order.orderNumber}`))}
            >
              <Copy />
            </Button>
            {status ? <PackageStatusPill view={status} showDetail={false} icons /> : null}
            <Badge variant={order.deliveryType === "effy" ? "success" : "secondary"}>{deliveryTypeText(order.deliveryType)}</Badge>
          </>
        }
        meta={
          <>
            <span>
              <CalendarDays aria-hidden="true" />
              Placed {moment(order.placedAt ?? order.createdAt).replace(/^(\w)/, (c) => c.toLowerCase())}
            </span>
            <span>
              <User aria-hidden="true" />
              <Link to="/customers/$customerId" params={{ customerId: order.customerId }} className="link">
                {order.customerName ?? order.customerEmail}
              </Link>
            </span>
            <span>
              {units} {units === 1 ? "item" : "items"} · {order.packages.length === 1 ? "one shop" : `${order.packages.length} shops`}
            </span>
          </>
        }
        actions={
          <MoreActions
            actions={[
              activity,
              canRecord && isPaid(order) ? { label: "Issue a refund…", icon: ReceiptText, onSelect: () => refund() } : null,
              movable && order.deliveryType === "effy"
                ? { label: "Change day or time…", icon: CalendarClock, onSelect: () => setMoving("retime") }
                : null,
              movable
                ? {
                    label: order.deliveryType === "effy" ? "Send by courier…" : "Deliver by Effy…",
                    icon: order.deliveryType === "effy" ? Truck : Route,
                    onSelect: () => setMoving(order.deliveryType === "effy" ? "courier" : "effy"),
                  }
                : null,
            ]}
          />
        }
      />

      <RecordFacts
        facts={[
          {
            key: "total",
            label: "Total",
            value: aud(order.grandTotalAmount, order.currency),
            note: order.paymentSplit
              ? `Card ${aud(order.paymentSplit.cardAmount, order.currency)} · points ${aud(order.paymentSplit.pointsAmount, order.currency)}`
              : isPaid(order)
                ? "Paid by card"
                : `Payment ${order.paymentStatus}`,
          },
          { key: "delivery", label: "Delivery", value: deliveryTypeText(order.deliveryType), note: promise ?? "—" },
          {
            key: "packages",
            label: "Packages",
            value: `${order.packages.length} · ${packed === order.packages.length ? "all packed" : `${packed} packed`}`,
            note: order.packages.map((p) => p.shopName).join(", "),
          },
          { key: "stage", label: "Customer sees", value: stage?.label ?? order.stage, note: order.finished ? "Every package has arrived" : stage?.note },
          {
            key: "refunds",
            label: "Refunds",
            value: request ? "Asked for" : Number(order.refundedAmount) > 0 ? aud(order.refundedAmount, order.currency) : "None",
            note: request ? "Waiting for a decision" : `${aud(order.refundableAmount, order.currency)} still refundable`,
          },
        ]}
      />

      {notices.length > 0 ? (
        <div className="mt-8">
          <BannerStack key={order.id} items={notices} label="Things to notice" />
        </div>
      ) : null}

      <RecordNav
        items={[
          { id: "packages", label: "Packages", count: order.packages.length, problem: problems.length > 0 },
          { id: "items", label: "Items", count: units },
          { id: "delivery", label: "Delivery" },
          { id: "payment", label: "Payment & refunds", count: request || order.proposedRefunds.length > 0 ? 1 : undefined },
        ]}
        compact={
          <>
            <b className="font-mono">{order.orderNumber}</b>
            {status ? <PackageStatusPill view={status} showDetail={false} /> : null}
          </>
        }
      />

      <RecordSection
        id="packages"
        icon={Package}
        title="Packages"
        description="Each shop packs its share, and it moves on its own until it reaches the customer. The customer only ever sees one order."
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
              ? (pkg, stg, assignment) => (
                  <AssignmentActions
                    packageId={pkg.fulfillmentId}
                    stage={stg}
                    assignment={assignment}
                    title={`${order.orderNumber} · ${pkg.shopName} · ${stg === "collection" ? "collection" : "delivery"}`}
                  />
                )
              : undefined
          }
        />
        {!canRecord ? (
          <p className="mt-4 text-sm text-muted-foreground">Recording a handover or an arrival needs a manager or administrator.</p>
        ) : null}
      </RecordSection>

      <RecordSection
        id="items"
        icon={List}
        title="Items"
        description={`What the customer bought, at the price they paid, by the shop that packs it.${canRecord ? " Tick lines to refund them." : ""}`}
      >
        <OrderItemsSection
          order={order}
          selection={
            canRecord && isPaid(order)
              ? {
                  selected,
                  onToggle: (id) =>
                    setSelected((s) => {
                      const next = new Set(s)
                      if (next.has(id)) next.delete(id)
                      else next.add(id)
                      return next
                    }),
                }
              : null
          }
        />
      </RecordSection>

      <RecordSection
        id="delivery"
        icon={Truck}
        title="Delivery"
        description="Who delivers, what the customer was sold, and how the fee was priced — once for the whole order."
        actions={
          movable && order.deliveryType === "effy" ? (
            <Button variant="outline" onClick={() => setMoving("retime")}>
              <CalendarClock aria-hidden="true" />
              Change day or time…
            </Button>
          ) : null
        }
      >
        <div className="grid gap-12 lg:grid-cols-2">
          <DeliveryTypeSection order={order} canChangeCollection={canRecord} canMove={canRecord} moving={moving} onMovingChange={setMoving}>
            <AddressBlock title="Delivering to" address={order.deliveryAddress} />
            <DeliveryInstructions instructions={order.deliveryInstructions} />
            {order.billingAddress ? (
              <AddressBlock title="Billing" address={order.billingAddress} />
            ) : (
              <p className="text-xs text-muted-foreground">Billing: same as delivery.</p>
            )}
          </DeliveryTypeSection>
          <FeeBreakdown breakdown={order.deliveryFeeBreakdown} />
        </div>
      </RecordSection>

      <RecordSection
        id="payment"
        icon={CreditCard}
        title="Payment & refunds"
        description="How it was paid, and what has gone back. A refund returns to the card first, then to points."
      >
        <div className="grid gap-8">
          <PaymentLines order={order} />
          <RefundsSection order={order} canIssue={canRecord} seed={seed} />
        </div>
      </RecordSection>

      <OrderBar
        position={nb.position}
        total={nb.total}
        totalCapped={nb.totalCapped}
        prev={nb.prev}
        next={nb.next}
        onOpen={open}
        status={status}
        promise={promise}
        actions={
          problems.length > 0
            ? [{ label: "Find the package", icon: Search, primary: true, onClick: () => goTo(`package-${problems[0]!.fulfillmentId}`) }]
            : request && canRecord
              ? [
                  { label: "Decline…", onClick: () => goTo("refund-request") },
                  {
                    label: "Refund…",
                    icon: ReceiptText,
                    primary: true,
                    onClick: () => refund(Object.fromEntries(request.items.map((i) => [i.orderItemId, i.quantity]))),
                  },
                ]
              : toHand && canRecord
                ? [
                    {
                      label: nextActionFor(toHand) === "handoff" ? "Record hand-over" : "Record arrival",
                      icon: Truck,
                      primary: true,
                      onClick: () => goTo(`package-${toHand.fulfillmentId}`),
                    },
                  ]
                : [
                    ...(movable && order.deliveryType === "effy" && order.stage !== "on_the_way" && order.stage !== "delivered"
                      ? [{ label: "Change day or time…", icon: CalendarClock, onClick: () => setMoving("retime") }]
                      : []),
                    ...(canRecord && isPaid(order) ? [{ label: "Issue a refund…", icon: ReceiptText, onClick: () => refund() }] : []),
                  ]
        }
      />
      <SelectedLinesBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        onRefund={() => refund(Object.fromEntries([...selected].map((id) => [id, refundableOf(order, id)])))}
      />

      <ActivityLogDrawer
        app="back-office"
        log="bo-order"
        title="Order activity"
        description={`${order.orderNumber} — packing, hand-overs, delivery, courier and refunds, in one log.`}
        api={api}
        path={`/orders/v1/orders/${order.id}/activity`}
        queryKey={ordersKeys.detail(order.id)}
        fileName={`order-${order.orderNumber}-activity`}
      />
    </RecordPage>
  )
}

/** The order's own items, four at a glance — its header's picture, as a product's is its main picture. */
function ItemCollage({ order }: { order: OrderDetail }) {
  const shown = order.items.slice(0, 4)
  const more = order.items.length - shown.length
  return (
    <button
      type="button"
      onClick={() => goTo("items")}
      aria-label={`${order.items.length} ${order.items.length === 1 ? "line" : "lines"} — go to Items`}
      className="relative grid size-full cursor-pointer grid-cols-2 gap-px overflow-hidden bg-border p-0"
    >
      {Array.from({ length: 4 }, (_, i) => {
        const item = shown[i]
        return (
          <span key={i} className="grid place-items-center bg-muted text-muted-foreground [&_svg]:size-4">
            {item?.imageUrl ? <img src={item.imageUrl} alt="" className="size-full object-cover" /> : item ? <Box aria-hidden="true" /> : null}
          </span>
        )
      })}
      {more > 0 ? (
        <span className="absolute right-1.5 bottom-1.5 rounded-sm bg-foreground/75 px-1.5 text-[11px] leading-5 font-semibold text-background">
          +{more}
        </span>
      ) : null}
    </button>
  )
}

function PaymentLines({ order }: { order: OrderDetail }) {
  const c = order.currency
  const m = order.paymentMethod
  const card = [m?.brand, m?.last4 ? `ending ${m.last4}` : null].filter(Boolean).join(" ") || m?.type || "Card"
  return (
    <div className="grid gap-12 lg:grid-cols-2">
      <div>
        <h3 className="mb-3 text-[13px] font-semibold">Paid with</h3>
        <ul className="m-0 grid list-none divide-y divide-border p-0">
          <li className="flex items-center gap-3 py-3 first:pt-0">
            <CreditCard aria-hidden="true" className="size-4 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{card}</span>
              <span className="block text-[13px] text-muted-foreground">{isPaid(order) ? "Captured at checkout" : `Payment ${order.paymentStatus}`}</span>
            </span>
            <span className="font-semibold tabular-nums">{aud(order.paymentSplit?.cardAmount ?? order.grandTotalAmount, c)}</span>
          </li>
          {order.paymentSplit ? (
            <li className="flex items-center gap-3 py-3">
              <Coins aria-hidden="true" className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Effy points</span>
                <span className="block text-[13px] text-muted-foreground">
                  {order.paymentSplit.pointsUsed.toLocaleString("en-AU")} points
                  {order.paymentSplit.pointsReturned > 0 ? ` · ${order.paymentSplit.pointsReturned.toLocaleString("en-AU")} returned` : ""}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{aud(order.paymentSplit.pointsAmount, c)}</span>
            </li>
          ) : null}
        </ul>
      </div>
      <div>
        <h3 className="mb-3 text-[13px] font-semibold">The money</h3>
        <dl className="m-0 grid text-sm tabular-nums [&_div]:flex [&_div]:justify-between [&_div]:gap-6 [&_div]:py-1.5 [&_dd]:m-0 [&_dt]:text-muted-foreground">
          <div>
            <dt>Total</dt>
            <dd>{aud(order.grandTotalAmount, c)}</dd>
          </div>
          <div>
            <dt>Refunded</dt>
            <dd>{aud(order.refundedAmount, c)}</dd>
          </div>
          <div className="mt-1.5 border-t pt-3! font-semibold [&_dt]:text-foreground!">
            <dt>Still refundable</dt>
            <dd>{aud(order.refundableAmount, c)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function AddressBlock({ title, address }: { title: string; address: Record<string, unknown> | null }) {
  const s = (k: string) => (address && typeof address[k] === "string" ? (address[k] as string) : "")
  const lines = [
    s("recipientName"),
    [s("line1"), s("line2")].filter(Boolean).join(", "),
    [s("city"), s("region"), s("postalCode")].filter(Boolean).join(" "),
    s("country"),
  ].filter(Boolean)
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <address className="text-sm not-italic">
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </address>
    </div>
  )
}

interface BarAction {
  label: string
  icon?: typeof Truck
  primary?: boolean
  onClick: () => void
}

/**
 * The order's controls on the console's one action bar: its place in the list with previous / next (← →) on the
 * left, and what its state calls for on the right. The page keeps room for the bar at its end.
 */
function OrderBar(props: {
  position: number | null
  total: number | null
  totalCapped: boolean
  prev?: string
  next?: string
  onOpen: (id: string) => void
  status: PackageStatusView | null
  promise: string | null
  actions: readonly BarAction[]
}) {
  const bar = useActionBar({ open: true, label: "Order", children: <OrderBarControls {...props} /> })
  return (
    <>
      <div aria-hidden="true" className="h-24" />
      {bar}
    </>
  )
}

const SOLID_PRIMARY =
  "border-transparent bg-primary-fill text-primary-foreground hover:bg-primary-fill/90 hover:text-primary-foreground dark:bg-primary-fill dark:hover:bg-primary-fill/90"

function OrderBarControls({ position, total, totalCapped, prev, next, onOpen, status, promise, actions }: Parameters<typeof OrderBar>[0]) {
  const density = useActionBarDensity()
  const roomy = density === "normal"
  const tight = density === "tight" || density === "scroll"
  return (
    <>
      <ActionBarButton asChild>
        <Link to="/orders">
          <ChevronLeft aria-hidden="true" />
          <span className={tight ? "sr-only" : undefined}>Orders</span>
        </Link>
      </ActionBarButton>
      {position !== null && total !== null ? (
        <b className="px-1 font-semibold tabular-nums">
          {position} of {total.toLocaleString("en-AU")}
          {totalCapped ? "+" : ""}
        </b>
      ) : null}
      <ActionBarButton size="icon-sm" disabled={!prev} onClick={() => prev && onOpen(prev)} aria-label="Previous order (←)" title="Previous order (←)">
        <ChevronLeft />
      </ActionBarButton>
      <ActionBarButton size="icon-sm" disabled={!next} onClick={() => next && onOpen(next)} aria-label="Next order (→)" title="Next order (→)">
        <ChevronRight />
      </ActionBarButton>
      <span className="ef-selbar__rule" aria-hidden="true" />
      {status && roomy ? (
        <span className="px-1">
          <b className="font-semibold">{STATUS_WORD[status.status]}</b>
          {promise ? <span className="ml-1.5 font-normal opacity-65">{promise}</span> : null}
        </span>
      ) : null}
      {actions.map((a) => (
        <ActionBarButton key={a.label} className={a.primary ? SOLID_PRIMARY : undefined} onClick={a.onClick}>
          {a.icon ? <a.icon aria-hidden="true" /> : null}
          {a.label}
        </ActionBarButton>
      ))}
    </>
  )
}

/** Ticked lines take the bar while they are ticked, as a table's selection does; clearing gives it back. */
function SelectedLinesBar({ count, onClear, onRefund }: { count: number; onClear: () => void; onRefund: () => void }) {
  return useActionBar({
    count,
    label: "Selected lines",
    onClear,
    children: (
      <ActionBarButton onClick={onRefund}>
        <ReceiptText aria-hidden="true" />
        Refund {count === 1 ? "this line" : "these lines"}…
      </ActionBarButton>
    ),
  })
}
