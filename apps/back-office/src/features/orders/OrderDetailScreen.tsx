import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CalendarClock,
  Calendar,
  CircleCheck,
  CreditCard,
  Eye,
  History,
  List,

  Package,
  ReceiptText,
  Truck,
  Undo2,
  Warehouse,
} from "lucide-react";

import { Badge, Button, Skeleton, Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@effy/design-system/ui";
import { leastAdvanced, type PackageStatusView } from "@effy/shared-types";
import { ErrorState, PackageStatusPill } from "@effy/web-kit/console";

import { PageHeader } from "@/components/patterns/Page";
import { DetailRows, Panel } from "@/components/patterns/Panel";
import { Callout } from "@/components/patterns/States";
import { initialsOf } from "@/components/shell/identity";
import { useHeaderDetail } from "@/components/shell/SiteHeader";
import { AssignmentActions } from "@/features/assign/AssignmentActions";
import { sessionQuery } from "@/features/auth/queries";
import { OrderCustomerPoints } from "@/features/customers/components/OrderCustomerPoints";
import { canDispatch } from "@/features/dispatch/access";
import { moment, money } from "@/lib/format";

import { canRecordOrderProgress } from "./access";
import { DeliveryInstructions } from "./components/DeliveryInstructions";
import { DeliveryTypeSection, type DeliveryMove } from "./components/DeliveryTypeSection";
import { FeeBreakdown } from "./components/FeeBreakdown";
import { PackageRows } from "./components/PackageRows";
import { RefundsSection } from "./components/RefundsSection";
import { orderActionError } from "./errorText";
import { deliveryTypeText, STAGE_LABEL, type OrderDetail, type OrderHistoryEntry } from "./model";
import { orderDetailQuery, useRecordArrival, useRecordHandoff } from "./queries";

/**
 * The order (redesign, boards "Order — Delivered by Effy" / "Order — Courier delivery").
 *
 * The header says the order, where it is and what the customer sees. Its independent sections —
 * packages, items, payment, refunds, history — are tabs, one at a time; the summary (customer,
 * delivery, who delivers it) is a rail that stays visible: beside the tabs from 1280px, above them
 * below that.
 *
 * ⚠ NO METRIC ROW AT THE TOP (Principle V): the header states the order and what the customer
 * currently sees, which is the one fact a support call opens with.
 */
type Section = "packages" | "items" | "payment" | "refunds" | "history";

function formatDateTime(iso: string | null): string {
  return moment(iso);
}

function addressLines(a: Record<string, unknown> | null): string[] {
  if (!a) return [];
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  return [
    s("recipientName"),
    [s("line1"), s("line2")].filter(Boolean).join(", "),
    [s("city"), s("region"), s("postalCode")].filter(Boolean).join(" "),
    s("country"),
  ].filter(Boolean);
}

/** A per-action idempotency key (027's rule): one press, one id, reused by a retry of that press. */
const newChangeId = () => crypto.randomUUID();

export function OrderDetailScreen({ orderId, highlight }: { orderId: string; highlight?: { parcelId?: string; packageId?: string } }) {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canRecord = canRecordOrderProgress(roles);
  const mayAssign = canDispatch(roles);

  const { data, error, isPending, isError, refetch } = useQuery(orderDetailQuery(orderId));
  // 096 — opened from a scan: bring the bag (or its package) into view once the order has loaded.
  const target = highlight?.parcelId ? `parcel-${highlight.parcelId}` : highlight?.packageId ? `package-${highlight.packageId}` : null;
  useEffect(() => {
    if (!target || !data) return;
    document.getElementById(target)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [target, data]);
  const handoff = useRecordHandoff(orderId);
  const arrival = useRecordArrival(orderId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("packages");
  const [moving, setMoving] = useState<DeliveryMove | null>(null);
  useHeaderDetail(data?.orderNumber);

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) return <DetailSkeleton />;

  const order: OrderDetail = data;
  const busy = handoff.isPending || arrival.isPending;
  const views = order.packages.map((p) => p.statusView).filter((v): v is PackageStatusView => v !== null && v !== undefined);
  const status = leastAdvanced(views);
  const openRequest = order.refundRequest && order.refundRequest.status === "open" ? order.refundRequest : null;
  const movable = canRecord && order.status === "paid" && order.deliveryType !== null;

  const onHandoff = (fulfillmentId: string, reference: string, carrierName: string) => {
    setActionError(null);
    handoff.mutate(
      { fulfillmentId, body: { reference, carrierName, changeId: newChangeId() } },
      { onError: (e) => setActionError(orderActionError(e, "handoff")) },
    );
  };
  const onArrival = (fulfillmentId: string) => {
    setActionError(null);
    arrival.mutate(
      { fulfillmentId, body: { changeId: newChangeId() } },
      { onError: (e) => setActionError(orderActionError(e, "arrival")) },
    );
  };

  return (
    <>
      <PageHeader
        back={{ label: "Orders", link: { to: "/orders" } }}
        title={
          <>
            <span className="bo-code text-2xl font-semibold">{order.orderNumber}</span>
            {status ? <PackageStatusPill view={status} showDetail={false} icons /> : null}
            {order.deliveryType ? <Badge variant={order.deliveryType === "effy" ? "success" : "secondary"}>{deliveryTypeText(order.deliveryType)}</Badge> : null}
          </>
        }
        meta={
          <>
            <span>
              <Calendar aria-hidden="true" />
              Placed {formatDateTime(order.placedAt).replace(/^(\w)/, (c) => c.toLowerCase())}
            </span>
            {/* What the SHOPPER currently sees — the words a support call opens with. */}
            <span>
              <Eye aria-hidden="true" />
              Customer sees: {STAGE_LABEL[order.stage] ?? order.stage}
              {order.finished ? " · Complete" : ""}
            </span>
            <span>
              <CreditCard aria-hidden="true" />
              {money(order.grandTotalAmount, order.currency)} {order.paymentStatus === "succeeded" || order.paymentStatus === "paid" ? "paid" : `· ${order.paymentStatus}`}
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

      {actionError ? (
        <Callout tone="destructive" title={actionError} />
      ) : null}

      {openRequest ? (
        <Callout tone="info" title="The customer has asked for a refund">
          “{openRequest.message}” Decide it under Refunds — issuing a refund closes the request.
        </Callout>
      ) : null}

      <div className="bo-detail">
        <div className="bo-detail__main">
          <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
            <div className="bo-tabsbar">
              <div className="bo-tabsbar__list">
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
                      <TabsCount>{order.refunds.length + (openRequest ? 1 : 0) + order.proposedRefunds.length}</TabsCount>
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

            <TabsContent value="packages" className="bo-tabpanel">
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
                  // 073 — "Assign to…" / "Unassign". Absent for a CSA; the fleet service refuses them anyway.
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

            <TabsContent value="items" className="bo-tabpanel">
              <Panel
                title={
                  <>
                    Items <span className="font-normal text-muted-foreground">· {order.items.reduce((n, i) => n + i.quantity, 0)}</span>
                  </>
                }
                flush
              >
                <div className="bo-table-scroll">
                  <table className="bo-table bo-rtable bo-table--compact bo-table--plain">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="is-num">Qty</th>
                        <th className="is-num">Unit</th>
                        <th className="is-num">Line</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((i) => (
                        <tr key={i.orderItemId}>
                          <td data-m="primary">
                            <div className="flex items-center gap-3">
                              <span className="bo-img size-9" aria-hidden="true">
                                <Package />
                              </span>
                              <span>{i.productName}</span>
                            </div>
                          </td>
                          <td data-m="meta" data-label="Qty" className="is-num">
                            {i.quantity}
                          </td>
                          <td data-m="hide" className="is-num is-muted">
                            {money(i.unitPriceAmount, order.currency)}
                          </td>
                          <td data-m="trail" className="is-num">
                            {money(i.lineSubtotalAmount, order.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </TabsContent>

            <TabsContent value="payment" className="bo-tabpanel">
              <Panel
                title="Payment"
                icon={<CreditCard aria-hidden="true" />}
                actions={<Badge variant={order.paymentStatus === "succeeded" || order.paymentStatus === "paid" ? "success" : "secondary"}>{order.paymentStatus === "succeeded" || order.paymentStatus === "paid" ? "Paid" : order.paymentStatus}</Badge>}
              >
                <div className="grid gap-6 lg:grid-cols-2">
                  <dl className="bo-dl">
                    <MoneyRow label="Items" value={money(order.itemSubtotalAmount, order.currency)} />
                    {Number(order.discountAmount) > 0 ? (
                      <MoneyRow label={`Discount${order.promoCode ? ` (${order.promoCode})` : ""}`} value={`−${money(order.discountAmount, order.currency)}`} />
                    ) : null}
                    <MoneyRow label="Delivery" value={money(order.deliveryFeeAmount, order.currency)} />
                    <MoneyRow strong label="Total" value={money(order.grandTotalAmount, order.currency)} />
                    {/* 074 — points are a way of PAYING, shown after the total, never as a discount above it. */}
                    {order.paymentSplit ? (
                      <>
                        <MoneyRow
                          label="Paid with points"
                          value={`${order.paymentSplit.pointsUsed.toLocaleString("en-AU")} points · ${money(order.paymentSplit.pointsAmount, order.currency)}${
                            order.paymentSplit.pointsReturned > 0 ? ` (${order.paymentSplit.pointsReturned.toLocaleString("en-AU")} returned)` : ""
                          }`}
                        />
                        <MoneyRow label="Paid by card" value={money(order.paymentSplit.cardAmount, order.currency)} />
                      </>
                    ) : null}
                    {/* Absent on a pre-052 order, or where the capture failed. Omitted, never invented. */}
                    {order.paymentMethod ? (
                      <MoneyRow
                        label="Method"
                        value={
                          [order.paymentMethod.brand, order.paymentMethod.last4 ? `ending ${order.paymentMethod.last4}` : null].filter(Boolean).join(" ") ||
                          order.paymentMethod.type
                        }
                      />
                    ) : null}
                  </dl>
                  {/* 077 — staff only. Absent on an order placed before the fee engine. */}
                  {order.deliveryFeeBreakdown ? <FeeBreakdown breakdown={order.deliveryFeeBreakdown} /> : null}
                </div>
              </Panel>
            </TabsContent>

            <TabsContent value="refunds" className="bo-tabpanel">
              <Panel
                title="Refunds"
                icon={<ReceiptText aria-hidden="true" />}
                description={`${money(order.refundableAmount, order.currency)} refundable · ${
                  Number(order.refundedAmount) > 0 ? `${money(order.refundedAmount, order.currency)} refunded` : "nothing refunded yet"
                }`}
              >
                <RefundsSection order={order} canIssue={canRecord} />
              </Panel>
            </TabsContent>

            <TabsContent value="history" className="bo-tabpanel">
              <Panel title="History" icon={<History aria-hidden="true" />}>
                {order.history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing has happened to this order yet.</p>
                ) : (
                  <ol className="bo-tl">
                    {order.history.map((h, i) => (
                      <HistoryItem key={`${h.at}-${i}`} entry={h} />
                    ))}
                  </ol>
                )}
              </Panel>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="bo-detail__aside is-first">
          <Panel
            title="Customer"
            actions={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/customers/$customerId" params={{ customerId: order.customerId }}>
                  View customer
                </Link>
              </Button>
            }
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="bo-avatar bo-avatar--lg bo-avatar--blue" aria-hidden="true">
                  {initialsOf(order.customerName ?? order.customerEmail)}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{order.customerName ?? order.customerEmail}</div>
                  {order.customerName ? <div className="bo-sub truncate">{order.customerEmail}</div> : null}
                </div>
              </div>
              {/* 074 — make things right while looking at the order that went wrong. */}
              <OrderCustomerPoints
                customerId={order.customerId}
                customerName={order.customerName ?? order.customerEmail}
                orderId={order.id}
                orderNumber={order.orderNumber}
                layout="block"
              />
            </div>
          </Panel>

          <DeliveryTypeSection
            order={order}
            formatDateTime={formatDateTime}
            canChangeCollection={canRecord}
            canMove={canRecord}
            moving={moving}
            onMovingChange={setMoving}
          >
            <div className="space-y-1">
              <div className="bo-eyebrow">Delivering to</div>
              <address className="text-sm not-italic">
                {addressLines(order.deliveryAddress).map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </address>
            </div>
            <DeliveryInstructions instructions={order.deliveryInstructions} />
            {order.billingAddress ? (
              <div className="space-y-1">
                <div className="bo-eyebrow">Billing</div>
                <address className="text-sm not-italic">
                  {addressLines(order.billingAddress).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </address>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Billing: same as delivery.</p>
            )}
          </DeliveryTypeSection>
        </aside>
      </div>
    </>
  );
}

function MoneyRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bo-dl__row">
      <dt className={strong ? "font-semibold text-foreground!" : undefined}>{label}</dt>
      <dd className={`text-right tabular-nums${strong ? " font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

const HISTORY_ICON = { fulfillment: Package, driver: Truck, handoff: Warehouse, arrival: CircleCheck } as const;

function HistoryItem({ entry: h }: { entry: OrderHistoryEntry }) {
  const Icon = HISTORY_ICON[h.kind] ?? Undo2;
  const tone = h.kind === "arrival" ? "bo-tl__mark--done" : h.kind === "driver" || h.kind === "handoff" ? "bo-tl__mark--primary" : "";
  return (
    <li className="bo-tl__item">
      <span className={`bo-tl__mark ${tone}`} aria-hidden="true">
        <Icon />
      </span>
      <div>
        <div className="bo-tl__title">{h.summary}</div>
        {h.actorSub ? (
          <div className="bo-tl__body">
            <span className="bo-code">{h.actorSub}</span>
          </div>
        ) : null}
      </div>
      <span className="bo-tl__time">{moment(h.at)}</span>
    </li>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="bo-detail">
        <div className="bo-detail__main">
          <Skeleton className="h-9 w-96 max-w-full" />
          <Skeleton className="h-64" />
        </div>
        <div className="bo-detail__aside">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  );
}

