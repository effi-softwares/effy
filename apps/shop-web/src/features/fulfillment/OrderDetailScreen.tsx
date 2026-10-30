import { useEffect, useState } from "react"

import { isShopManager, PARCEL_ZONE_WORDS } from "@effy/shared-types"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { useHotkey } from "@tanstack/react-hotkeys"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Info,
  ListChecks,
  MessageSquare,
  PackageCheck,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  Tag,
  Truck,
} from "lucide-react"

import { Badge, Button, Kbd } from "@effy/design-system/ui"
import { ActionBarButton, useActionBar, useActionBarDensity } from "@effy/web-kit/action-bar"
import { ActivityLogDrawer, useActivityAction } from "@effy/web-kit/activity-log"
import { ErrorState, PackageStatusPill, useHeaderDetail, type HeaderBack } from "@effy/web-kit/console"
import {
  BannerStack,
  DetailRows,
  InspectorSection,
  MoreActions,
  RecordFacts,
  RecordHeader,
  RecordNav,
  RecordPage,
  RecordPageSkeleton,
  RecordSection,
  Timeline,
  TimelineItem,
  type BannerStackItem,
} from "@effy/web-kit/patterns"

import { sessionQuery } from "@/features/auth/queries"
import { api } from "@/lib/api"
import { track } from "@/lib/telemetry"

import { collectionLine } from "./collection"
import { CourierPickup } from "./components/CourierPickup"
import { FulfilDialog } from "./components/FulfilDialog"
import { ItemsAndFulfilment } from "./components/ItemsAndFulfilment"
import { OrderNoteDialog, OrderTagsDialog } from "./components/OrderNotesAndTags"
import { PaymentPill } from "./components/OrderPill"
import { PackBags } from "./components/PackBags"
import { RefundSheet } from "./components/RefundSheet"
import { CantSupplyDialog, stateNote } from "./components/StateControl"
import { useOrderNeighbours } from "./components/useOrderNeighbours"
import { canDeclareUnfulfillable } from "./model"
import {
  canPick,
  deliveredByText,
  formatMoney,
  formatWhen,
  paymentMethodText,
  pickModeOf,
  refundableQuantity,
  validateOrdersSearch,
  type OrderDetail,
  type OrdersSearch,
} from "./orderConsole"
import { printPickLists } from "./pickList"
import { orderDetailQuery, useTransitionFulfillment } from "./queries"

const SECTIONS = [
  { id: "pick", icon: ClipboardList, title: "Pick list" },
  { id: "bags", icon: ShoppingBag, title: "Bags & labels" },
  { id: "notes", icon: MessageSquare, title: "Team notes" },
] as const

/** Inside this, the ready-by time is pressing (orange); past it, a problem (rose). */
const SOON_MINUTES = 30

export function OrderDetailScreen({ fulfillmentId }: { fulfillmentId: string }) {
  const search = validateOrdersSearch(useSearch({ strict: false }) as Record<string, unknown>)
  // The order on screen stays while the next one reads: stepping through orders never flashes a skeleton.
  const q = useQuery({ ...orderDetailQuery(fulfillmentId), placeholderData: keepPreviousData })
  // Back to the list as it was left: its view rides in this order's address.
  const back: HeaderBack = { label: "Orders", link: { to: "/orders", search: { ...search } } }

  if (q.isError) {
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} forbiddenMessage="This order isn't available to your shop." />
  }
  if (q.isPending) {
    return (
      <RecordPageSkeleton
        label="Loading order"
        railTitle="About this order"
        back={back}
        facts={["Ready by", "Collected by", "Lines picked", "Bags", "Your items"]}
        sections={SECTIONS}
        rail={["Where it is", "Customer and delivery", "Payment"]}
      />
    )
  }
  return <OrderPage key={q.data.id} detail={q.data} search={search} back={back} />
}

function OrderPage({
  detail,
  search,
  back,
}: {
  detail: OrderDetail
  search: OrdersSearch
  back: HeaderBack
}) {
  const navigate = useNavigate()
  useHeaderDetail(detail.orderNumber)
  const { data: session } = useQuery(sessionQuery)
  const activity = useActivityAction()
  const transition = useTransitionFulfillment(detail.id)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [fulfilOpen, setFulfilOpen] = useState(false)

  useEffect(() => {
    track({ name: "shop_order_opened", fulfillmentId: detail.id, status: detail.status })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per portion, not per status change
  }, [detail.id])

  // A courtesy, not the gate. The backend decides from the platform record.
  const canRefund = session?.status === "signed-in" && isShopManager(session.identity.roles)
  const refundable = canRefund && detail.lines.some((l) => refundableQuantity(l) > 0)
  const currency = detail.money.currency
  const units = detail.lines.reduce((n, l) => n + l.orderedQuantity, 0)
  const modes = detail.lines.map((l) => pickModeOf(l))
  const picked = modes.filter((m) => m !== "none").length
  const short = modes.filter((m) => m === "part" || m === "unavailable").length
  const picking = canPick(detail.status)
  const printed = detail.parcels.filter((p) => p.printed.count > 0).length
  const due = dueOf(detail.readyBy, picking)
  const note = stateNote(detail.status)
  const goesWith = detail.deliveredBy === "courier" ? "A courier" : "An Effy driver"

  const nb = useOrderNeighbours(detail.id, search)
  const open = (to: { id: string; search: OrdersSearch } | null) =>
    to && void navigate({ to: "/orders/$fulfillmentId", params: { fulfillmentId: to.id }, search: to.search })
  useHotkey("ArrowLeft", () => open(nb.prev), { ignoreInputs: true })
  useHotkey("ArrowRight", () => open(nb.next), { ignoreInputs: true })
  useHotkey("R", () => detail.status === "picking" && setFulfilOpen(true), { ignoreInputs: true })

  const notices: BannerStackItem[] = [
    ...(due?.tone === "over"
      ? [
          {
            key: "late",
            tone: "problem" as const,
            icon: CircleAlert,
            title: `It’s ${due.minutes} ${due.minutes === 1 ? "minute" : "minutes"} past its ready-by time`,
            children: <p>{goesWith} is coming for it. Finish the last lines, or say what you can’t supply and mark it ready.</p>,
          },
        ]
      : detail.atRisk
        ? [{ key: "risk", tone: "problem" as const, icon: CircleAlert, title: "At risk of missing its collection", children: <p>Pack it by {formatWhen(detail.readyBy)}.</p> }]
        : []),
    ...(note ? [{ key: "state", tone: detail.status === "unfulfillable" ? ("problem" as const) : ("info" as const), icon: Info, title: note }] : []),
    ...(short > 0 && picking
      ? [
          {
            key: "short",
            icon: Info,
            title: short === 1 ? "One line is short" : `${short} lines are short`,
            children: <p>Effy tells the customer and refunds them for what you couldn’t supply. You’re paid for what you send.</p>,
          },
        ]
      : []),
  ]

  return (
    <RecordPage
      railTitle="About this order"
      rail={
        <>
          <InspectorSection title="Where it is">
            <div className="grid gap-3">
              <PackageStatusPill view={detail.statusView} />
              <p className="text-sm text-muted-foreground">
                {picking
                  ? `Pack it by ${formatWhen(detail.readyBy)}. ${goesWith} collects it${detail.collection ? `, ${collectionLine(detail.collection)}` : ""}.`
                  : detail.status === "ready_for_pickup"
                    ? `Ready. ${goesWith} collects it${detail.collection ? `, ${collectionLine(detail.collection)}` : ""} — keep chilled and frozen bags cold until then.`
                    : `${goesWith} has it. Nothing more to do.`}
              </p>
            </div>
          </InspectorSection>
          <InspectorSection title="Customer and delivery">
            <DetailRows
              tight
              rows={[
                {
                  label: "Customer",
                  value: (
                    <>
                      <div className="font-medium">{detail.delivery.recipientName || "—"}</div>
                      {detail.delivery.phone ? (
                        <a href={`tel:${detail.delivery.phone}`} className="text-muted-foreground no-underline hover:underline">
                          {detail.delivery.phone}
                        </a>
                      ) : null}
                    </>
                  ),
                },
                { label: "Ship to", value: <span className="whitespace-pre-line">{addressText(detail)}</span> },
                { label: "Bill to", value: <span className="text-muted-foreground">Held by Effy with the payment.</span> },
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
            {detail.courierPickup ? (
              <div className="mt-4 border-t pt-4">
                <CourierPickup fulfillmentId={detail.id} status={detail.status} pickup={detail.courierPickup} />
              </div>
            ) : null}
          </InspectorSection>
          <InspectorSection title="Payment" actions={<PaymentPill state={detail.payment.state} />}>
            <div className="grid gap-3">
              <DetailRows
                tight
                rows={[
                  { label: "Your items", value: <span className="tabular-nums">{formatMoney(detail.money.shopSubtotal, currency)}</span> },
                  { label: "Refunded", value: <span className="tabular-nums">{formatMoney(detail.money.refunded, currency)}</span> },
                  { label: "Net", value: <span className="font-semibold tabular-nums">{formatMoney(detail.money.net, currency)}</span> },
                ]}
              />
              <p className="text-sm text-muted-foreground">
                {paymentMethodText(detail.payment)} · {formatMoney(detail.payment.amount, currency)} captured at checkout
              </p>
              {refundable ? (
                <Button variant="outline" onClick={() => setRefundOpen(true)}>
                  <ReceiptText aria-hidden="true" />
                  Refund
                </Button>
              ) : null}
            </div>
          </InspectorSection>
          {/* Room for the action bar, which floats over the rail's foot too. */}
          <div aria-hidden="true" className="h-20 flex-none" />
        </>
      }
    >
      <RecordHeader
        back={back}
        media={<LineCollage detail={detail} />}
        eyebrow={`Goes with ${detail.deliveredBy === "courier" ? "a courier" : "an Effy driver"}`}
        title={
          <>
            <span className="font-mono tracking-[-.03em]">{detail.orderNumber}</span>
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
              {units} {units === 1 ? "item" : "items"}
            </span>
            <span>
              <Truck aria-hidden="true" />
              {deliveredByText(detail.deliveredBy)}
            </span>
          </>
        }
        actions={
          <MoreActions
            actions={[
              activity,
              { label: "Print pick list", icon: Printer, onSelect: () => printPickList(detail) },
              { label: "Edit tags", icon: Tag, onSelect: () => setTagsOpen(true) },
              refundable ? { label: "Refund…", icon: ReceiptText, onSelect: () => setRefundOpen(true) } : null,
              canDeclareUnfulfillable(detail.status)
                ? { label: "Can't supply it…", icon: CircleAlert, destructive: true, onSelect: () => setCancelOpen(true) }
                : null,
            ]}
          />
        }
      />

      <RecordFacts
        facts={[
          {
            key: "ready",
            label: "Ready by",
            value: <span className={due ? DUE_TONE[due.tone] : undefined}>{formatWhen(detail.readyBy)}</span>,
            note: due ? <span className={DUE_TONE[due.tone]}>{due.words}</span> : detail.status === "ready_for_pickup" ? "Ready" : "Gone",
          },
          {
            key: "with",
            label: "Collected by",
            value: detail.deliveredBy === "courier" ? "Courier" : "Effy driver",
            note: detail.collection ? collectionLine(detail.collection) : detail.courierPickup ? "A courier pickup" : "—",
          },
          {
            key: "lines",
            label: "Lines picked",
            value: `${picked} of ${detail.lines.length}`,
            note: short > 0 ? `${short} short` : picked === detail.lines.length ? "Every line accounted for" : `${detail.lines.length - picked} to go`,
          },
          {
            key: "bags",
            label: "Bags",
            value: `${detail.parcels.length} · ${printed} printed`,
            note: detail.zonesNeeded.length > 0 ? `Needs ${detail.zonesNeeded.map((z) => PARCEL_ZONE_WORDS[z].toLowerCase()).join(", ")}` : "—",
          },
          { key: "money", label: "Your items", value: formatMoney(detail.money.shopSubtotal, currency), note: `Net ${formatMoney(detail.money.net, currency)}` },
        ]}
      />

      {notices.length > 0 ? (
        <div className="mt-8">
          <BannerStack key={detail.id} items={notices} label="Things to notice" />
        </div>
      ) : null}

      <RecordNav
        items={[
          { id: "pick", label: "Pick list", count: `${picked}/${detail.lines.length}` },
          { id: "bags", label: "Bags & labels", count: detail.parcels.length },
          { id: "notes", label: "Team notes", count: detail.notes.length },
        ]}
        compact={
          <>
            <b className="font-mono">{detail.orderNumber}</b>
            <PackageStatusPill view={detail.statusView} />
          </>
        }
      />

      <RecordSection
        id="pick"
        icon={ClipboardList}
        title="Pick list"
        description="In walking order — the shelves first, cold things last. Tick a line as it goes in the bag, or scan its barcode."
      >
        <ItemsAndFulfilment detail={detail} />
      </RecordSection>

      <RecordSection
        id="bags"
        icon={ShoppingBag}
        title="Bags & labels"
        description="One bag per temperature, each with its own label, scanned as it is packed."
      >
        <PackBags detail={detail} />
      </RecordSection>

      <RecordSection
        id="notes"
        icon={MessageSquare}
        title="Team notes"
        description="Only your team sees notes. They can't be edited once added."
        actions={
          <Button variant="outline" onClick={() => setNoteOpen(true)}>
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
                    <time className="text-xs font-normal whitespace-nowrap text-muted-foreground" dateTime={n.createdAt}>
                      {formatWhen(n.createdAt)}
                    </time>
                  </span>
                }
              >
                <span className="mt-1 block rounded-lg bg-muted px-3 py-2 whitespace-pre-line text-foreground text-pretty">{n.body}</span>
              </TimelineItem>
            ))}
          </Timeline>
        )}
      </RecordSection>

      <OrderBar
        position={nb.position}
        total={nb.total}
        prev={nb.prev ? () => open(nb.prev) : null}
        next={nb.next ? () => open(nb.next) : null}
        back={back}
        lead={
          picking
            ? { title: `${picked} of ${detail.lines.length} picked`, sub: picked < detail.lines.length ? `${detail.lines.length - picked} to go` : "Every line accounted for" }
            : detail.status === "ready_for_pickup"
              ? { title: "Ready", sub: detail.collection ? collectionLine(detail.collection) : `${goesWith} collects it` }
              : { title: detail.statusView.word, sub: null }
        }
        actions={[
          ...(detail.status === "received"
            ? [{ label: "Start picking", icon: ListChecks, primary: true, busy: transition.isPending, onClick: () => transition.mutate({ to: "picking", from: detail.status }) }]
            : []),
          ...(detail.status === "picking"
            ? [
                { label: "Can't supply…", onClick: () => setCancelOpen(true) },
                { label: "Mark ready", icon: PackageCheck, primary: true, hint: "R", onClick: () => setFulfilOpen(true) },
              ]
            : []),
          ...(detail.status === "ready_for_pickup"
            ? [{ label: "Reopen picking", icon: RotateCcw, busy: transition.isPending, onClick: () => transition.mutate({ to: "picking", from: detail.status }) }]
            : []),
          ...(!picking && detail.status !== "ready_for_pickup" && refundable
            ? [{ label: "Refund…", icon: ReceiptText, onClick: () => setRefundOpen(true) }]
            : []),
        ]}
      />

      <ActivityLogDrawer
        app="shop-web"
        log="shop-order"
        title="Order activity"
        description={`${detail.orderNumber} — everything that has happened on this order.`}
        api={api}
        path={`/shop/v1/orders/${detail.id}/activity`}
        queryKey={["shop", "fulfillment", "orders", "detail", detail.id]}
        fileName={`order-${detail.orderNumber}-activity`}
      />
      <FulfilDialog detail={detail} open={fulfilOpen} onOpenChange={setFulfilOpen} />
      <CantSupplyDialog targets={[detail]} open={cancelOpen} onOpenChange={setCancelOpen} />
      <OrderTagsDialog fulfillmentId={detail.id} tags={detail.tags} open={tagsOpen} onOpenChange={setTagsOpen} />
      <OrderNoteDialog fulfillmentId={detail.id} open={noteOpen} onOpenChange={setNoteOpen} />
      {canRefund ? (
        <RefundSheet
          detail={{ id: detail.id, orderId: detail.orderId, orderNumber: detail.orderNumber, currency, lines: detail.lines }}
          open={refundOpen}
          onOpenChange={setRefundOpen}
        />
      ) : null}
    </RecordPage>
  )
}

const DUE_TONE = { calm: "", soon: "text-accent2", over: "font-medium text-destructive" } as const

/** The ready-by time while the package is still being packed: how long is left, or how late it is. */
function dueOf(readyBy: string | null, picking: boolean, now = Date.now()): { tone: keyof typeof DUE_TONE; minutes: number; words: string } | null {
  if (!picking || !readyBy) return null
  const minutes = Math.round((Date.parse(readyBy) - now) / 60_000)
  if (minutes < 0) return { tone: "over", minutes: -minutes, words: `${-minutes} min late` }
  return { tone: minutes <= SOON_MINUTES ? "soon" : "calm", minutes, words: minutes >= 120 ? `in ${Math.round(minutes / 60)} h` : `in ${minutes} min` }
}

/** The package's own lines, four at a glance — its header's picture. */
function LineCollage({ detail }: { detail: OrderDetail }) {
  const shown = detail.lines.slice(0, 4)
  const more = detail.lines.length - shown.length
  return (
    <button
      type="button"
      onClick={() => document.getElementById("pick")?.scrollIntoView?.({ block: "start" })}
      aria-label={`${detail.lines.length} ${detail.lines.length === 1 ? "line" : "lines"} — go to the pick list`}
      className="relative grid size-full cursor-pointer grid-cols-2 gap-px overflow-hidden bg-border p-0"
    >
      {Array.from({ length: 4 }, (_, i) => {
        const l = shown[i]
        return (
          <span key={i} className="grid place-items-center bg-muted">
            {l?.imageUrl ? <img src={l.imageUrl} alt="" className="size-full object-cover" /> : null}
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

interface BarAction {
  label: string
  icon?: typeof Truck
  primary?: boolean
  busy?: boolean
  hint?: string
  onClick: () => void
}

/**
 * The order's controls on the console's one action bar: its place in the order list with previous / next (← →) on
 * the left, and what its state calls for on the right. The page keeps room for the bar at its end.
 */
function OrderBar(props: {
  position: number | null
  total: number | null
  prev: (() => void) | null
  next: (() => void) | null
  back: HeaderBack
  lead: { title: string; sub: string | null }
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

const SOLID_BRAND =
  "border-transparent bg-brand-fill text-brand-foreground hover:bg-brand-fill/90 hover:text-brand-foreground dark:bg-brand-fill dark:hover:bg-brand-fill/90"

function OrderBarControls({ position, total, prev, next, back, lead, actions }: Parameters<typeof OrderBar>[0]) {
  const density = useActionBarDensity()
  const roomy = density === "normal"
  const tight = density === "tight" || density === "scroll"
  return (
    <>
      <ActionBarButton asChild>
        <Link {...back.link}>
          <ChevronLeft aria-hidden="true" />
          <span className={tight ? "sr-only" : undefined}>Orders</span>
        </Link>
      </ActionBarButton>
      {position !== null && total !== null ? (
        <b className="px-1 font-semibold tabular-nums">
          {position} of {total}
        </b>
      ) : null}
      <ActionBarButton size="icon-sm" disabled={!prev} onClick={() => prev?.()} aria-label="Previous order (←)" title="Previous order (←)">
        <ChevronLeft />
      </ActionBarButton>
      <ActionBarButton size="icon-sm" disabled={!next} onClick={() => next?.()} aria-label="Next order (→)" title="Next order (→)">
        <ChevronRight />
      </ActionBarButton>
      <span className="ef-selbar__rule" aria-hidden="true" />
      <span className="px-1">
        <b className="font-semibold">{lead.title}</b>
        {lead.sub && roomy ? <span className="ml-1.5 font-normal opacity-65">{lead.sub}</span> : null}
      </span>
      {actions.map((a) => (
        <ActionBarButton key={a.label} className={a.primary ? SOLID_BRAND : undefined} disabled={a.busy} onClick={a.onClick}>
          {a.icon ? <a.icon aria-hidden="true" /> : null}
          {a.label}
          {a.hint && roomy ? <Kbd className="ml-1">{a.hint}</Kbd> : null}
        </ActionBarButton>
      ))}
    </>
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
