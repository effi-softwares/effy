import { useEffect, useState, type ReactNode } from "react";

import { isShopManager } from "@effy/shared-types";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, History, ImageOff } from "lucide-react";

import {
  Button,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import {
  DetailSection,
  Field,
  FieldGrid,
  MetaDivider,
  Page,
  Pill,
  SectionAction,
} from "@/components/console/primitives";
import { sessionQuery } from "@/features/auth/queries";
import { track } from "@/lib/telemetry";
import { cn } from "@/lib/utils";

import { FulfillmentStatusBadge } from "./components/FulfillmentStatusBadge";
import { OrderActivitySheet } from "./components/OrderActivitySheet";
import { OrderNoteDialog, OrderTagsDialog } from "./components/OrderNotesAndTags";
import { PickList } from "./components/PickList";
import { RefundSheet } from "./components/RefundSheet";
import { CantSupplyDialog, StateActions, stateNote } from "./components/StateControl";
import { canDeclareUnfulfillable, STATUS_LABEL } from "./model";
import {
  formatMoney,
  formatWhen,
  methodText,
  PAYMENT_LABEL,
  paymentMethodText,
  refundableQuantity,
  type OrderDetail,
  type OrdersSearch,
} from "./orderConsole";
import { orderDetailQuery, orderListQuery } from "./queries";

type DetailTab = "summary" | "items" | "fulfilment";

const TABS: readonly { value: DetailTab; label: string }[] = [
  { value: "summary", label: "Summary" },
  { value: "items", label: "Items" },
  { value: "fulfilment", label: "Fulfilment" },
];

/**
 * Order detail, rebuilt to the imported design and product detail's conventions (057 Amendment A3).
 *
 * ⚠ THREE TABS — Summary (who, where, money, tags, notes) · Items (the priced lines and their refunds)
 * · Fulfilment (picking and handoff) — and the tab RESETS per order: the body is keyed on the id, so
 * previous/next always lands on Summary, as product detail lands on Details.
 *
 * ⚠ THE MOCKUP'S BLOCKS THAT STILL DO NOT EXIST HERE, AND WHY (A3 settled the money question; these it
 * did not change):
 *   • CAPTURE — Effy captures at payment (`CaptureMethod: automatic`, 055 R3). The mockup shows the
 *     button only for an authorised-but-uncaptured order, and no Effy order is ever in that state, so
 *     following the design faithfully means it never renders. Authorised and Captured are shown as the
 *     one figure they always are.
 *   • "VAT 25%" — Swedish. Australian grocery is a mixed GST supply and per-item GST is unmodelled
 *     (052 R13); a tax line here would be a number nobody computed.
 *   • EDIT ORDER / DUPLICATE / PRINT INVOICE — an order is a paid record 055 refuses to edit, and the
 *     platform cannot issue a tax invoice (`canIssueTaxInvoice()` is false, 052 FR-031).
 *   • SHIPMENTS, CARRIER, TRACKING — a shop hands its package to an Effy driver (049); a delivery
 *     partner may carry a standard package after the hub, and its reference is staff-only (053
 *     FR-022). The Fulfilment tab shows the handoff the shop actually takes part in.
 *   • RETURNS — the platform has no returns model. A refund's "put back on the shelf" is the one
 *     restock a shop can do, and it lives in the refund sheet.
 *   • BILLING ADDRESS, EMAIL, ORDER HISTORY — never shared with a shop (023 FR-018).
 * `__tests__/order-detail.test.tsx` reads this directory's source and fails naming the file if any of
 * the forbidden controls reappears.
 *
 * ⚠ Opening this screen IS the acknowledgement — a `pending` portion becomes `received` as a side
 * effect of the read (FR-011a), which is why there is no "acknowledge" button anywhere.
 */
export function OrderDetailScreen({
  fulfillmentId,
  search = {},
  onNavigate,
}: {
  fulfillmentId: string;
  /** The list this order was opened from — drives previous/next. */
  search?: OrdersSearch;
  onNavigate?: (fulfillmentId: string, search: OrdersSearch) => void;
}) {
  return (
    <OrderDetailBody
      key={fulfillmentId}
      fulfillmentId={fulfillmentId}
      search={search}
      onNavigate={onNavigate}
    />
  );
}

function OrderDetailBody({
  fulfillmentId,
  search,
  onNavigate,
}: {
  fulfillmentId: string;
  search: OrdersSearch;
  onNavigate?: (fulfillmentId: string, search: OrdersSearch) => void;
}) {
  const { data, error, isPending, isError, refetch } = useQuery(orderDetailQuery(fulfillmentId));
  const { data: session } = useQuery(sessionQuery);
  const [tab, setTab] = useState<DetailTab>("summary");
  const [activityOpen, setActivityOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [refund, setRefund] = useState<{ open: boolean; lineId: string | null }>({ open: false, lineId: null });

  // Keyed on the portion id, not on `data` — "the operator opened this order", once per open.
  const openedStatus = data?.status;
  useEffect(() => {
    if (!openedStatus) return;
    track({ name: "shop_order_opened", fulfillmentId, status: openedStatus });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per portion, not per status change
  }, [fulfillmentId]);

  // ⚠ FR-014b — a courtesy, not the gate. The backend decides from the platform record (role AND
  // status AND this shop's own portion of THIS order) and refuses regardless of what renders here.
  const canRefund = session?.status === "signed-in" && isShopManager(session.identity.roles);

  const nav = <OrderNeighbours fulfillmentId={fulfillmentId} search={search} onNavigate={onNavigate} />;

  if (isError) {
    return (
      <Page>
        {nav}
        <ErrorState
          error={error}
          onRetry={() => void refetch()}
          forbiddenMessage="This order isn't available to your shop."
        />
      </Page>
    );
  }
  if (isPending) {
    return (
      <Page>
        {nav}
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }

  const detail: OrderDetail = data;
  const shortfall = detail.lines.reduce((n, l) => n + l.unavailableQuantity, 0);
  const units = detail.lines.reduce((n, l) => n + l.orderedQuantity, 0);
  const note = stateNote(detail.status);
  const openRefund = (lineId: string | null = null) => setRefund({ open: true, lineId });

  return (
    <Page className="gap-[22px]">
      {nav}

      {/* ── Header block: identity, pills, and the actions ───────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-[18px]">
        <div className="grid min-w-[240px] flex-1 gap-2">
          <div className="font-mono text-[22px] leading-[1.15] font-semibold tracking-[-.02em]">
            {detail.orderNumber}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2.5 text-[13px]">
            <span className="text-foreground font-medium">{detail.delivery.recipientName || "—"}</span>
            <MetaDivider />
            <span>Placed {formatWhen(detail.placedAt)}</span>
            <MetaDivider />
            <span>Ready by {formatWhen(detail.readyBy)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FulfillmentStatusBadge status={detail.status} />
            <Pill variant={detail.payment.state === "paid" ? "quiet" : "outline"}>
              {PAYMENT_LABEL[detail.payment.state]}
            </Pill>
            {detail.deliveryMethod ? <Pill variant="quiet">{methodText(detail.deliveryMethod)}</Pill> : null}
            {detail.atRisk ? <Pill variant="strong">At risk</Pill> : null}
            {shortfall > 0 ? <Pill variant="outline">{shortfall} short</Pill> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setActivityOpen(true)}>
            <History />
            Activity
          </Button>
          {canDeclareUnfulfillable(detail.status) ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              Can&apos;t supply
            </Button>
          ) : null}
          <StateActions detail={detail} />
        </div>
      </div>

      {note ? <p className="text-muted-foreground -mt-2 text-[13px]">{note}</p> : null}

      {shortfall > 0 ? (
        <div
          role="status"
          className="border-border bg-muted flex items-start gap-2 rounded-md border px-4 py-3 text-sm"
        >
          <AlertTriangle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">
              {shortfall} item{shortfall === 1 ? "" : "s"} flagged unavailable
            </p>
            <p className="text-muted-foreground">
              This order can still be completed with the remaining items. The shortfall stays
              recorded — refund it from the Items tab if the customer should get that money back.
            </p>
          </div>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as DetailTab)} className="gap-[22px]">
        <TabsList className="max-w-full flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              // ⚠ Inactive triggers are MUTED in both appearances (product detail's rule).
              className="text-muted-foreground hover:text-foreground data-[state=active]:text-foreground flex-none px-[13px]"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Summary: who, where, the money, and the shop's own tags and notes ────────────────── */}
        <TabsContent value="summary" className="grid gap-[34px]">
          <DetailSection title="Customer" subtitle="Who placed this order and how to reach them.">
            <FieldGrid>
              <Field label="Name" value={detail.delivery.recipientName || "—"} />
              <Field label="Phone" value={detail.delivery.phone ?? "—"} mono={!!detail.delivery.phone} />
              <Field label="Delivery" value={methodText(detail.deliveryMethod)} />
              <Field label="Ready by" value={formatWhen(detail.readyBy)} />
            </FieldGrid>
          </DetailSection>

          <DetailSection title="Addresses" subtitle="Where this order ships and bills.">
            <FieldGrid>
              <Field label="Ship to" value={<AddressLines detail={detail} />} />
              {/* ⚠ Named, and said to be withheld — not silently missing. 023 FR-018 keeps it from
                  every shop surface; Effy holds it with the payment. */}
              <Field
                label="Bill to"
                value={<span className="text-muted-foreground">Held by Effy with the payment — not shared with shops.</span>}
              />
            </FieldGrid>
          </DetailSection>

          <DetailSection
            title="Payment"
            subtitle="How this order was paid and what is still outstanding."
            action={
              canRefund && detail.lines.some((l) => refundableQuantity(l) > 0) ? (
                <SectionAction onClick={() => openRefund()}>Refund</SectionAction>
              ) : undefined
            }
          >
            <FieldGrid>
              <Field label="Method" value={paymentMethodText(detail.payment)} />
              <Field label="Status" value={PAYMENT_LABEL[detail.payment.state]} emphasis={detail.payment.state !== "paid"} />
              <Field label="Paid" value={formatWhen(detail.payment.paidAt)} />
            </FieldGrid>
            <div className="grid grid-cols-2 gap-x-8 gap-y-[18px] pt-[18px] sm:grid-cols-4">
              <Field label="Authorised" size="display" value={formatMoney(detail.payment.amount, detail.money.currency)} />
              {/* ⚠ Always equal to Authorised — capture is automatic at checkout (055 R3). Shown, as
                  the design asks, so nobody wonders whether something is still held. */}
              <Field label="Captured" size="display" value={formatMoney(detail.payment.amount, detail.money.currency)} />
              <Field
                label="Refunded"
                size="display"
                value={
                  <>
                    {formatMoney(detail.money.refunded, detail.money.currency)}
                    {Number(detail.money.refundPending) > 0 ? (
                      <span className="text-muted-foreground block text-[12.5px] font-normal tracking-normal">
                        + {formatMoney(detail.money.refundPending, detail.money.currency)} on its way
                      </span>
                    ) : null}
                  </>
                }
              />
              <Field label="Net" size="display" value={formatMoney(detail.money.net, detail.money.currency)} />
            </div>
            {detail.refunds.length > 0 ? <RefundsTable detail={detail} /> : null}
          </DetailSection>

          <DetailSection
            title="Tags"
            subtitle="Labels your team uses to spot orders that need care."
            action={<SectionAction onClick={() => setTagsOpen(true)}>Edit</SectionAction>}
          >
            {detail.tags.length === 0 ? (
              <p className="text-muted-foreground pt-[18px] text-[13px]">No tags yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 pt-[18px]">
                {detail.tags.map((t) => (
                  <span
                    key={t}
                    className="border-border bg-muted rounded-full border px-[9px] py-0.5 text-[12px] whitespace-nowrap"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection
            title="Internal notes"
            subtitle="For your team only — the customer never sees these."
            action={<SectionAction onClick={() => setNoteOpen(true)}>Add note</SectionAction>}
          >
            {detail.notes.length === 0 ? (
              <p className="text-muted-foreground pt-[18px] text-[13px]">No notes yet.</p>
            ) : (
              <ol className="grid gap-4 pt-[18px]">
                {detail.notes.map((n) => (
                  <li key={n.id} className="grid gap-1">
                    <p className="max-w-[68ch] text-[13.5px] leading-[1.55] whitespace-pre-line text-pretty">
                      {n.body}
                    </p>
                    <p className="text-muted-foreground text-[12px]">
                      {n.authorLabel ? `${formatWhen(n.createdAt)} · ${n.authorLabel}` : formatWhen(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </DetailSection>
        </TabsContent>

        {/* ── Items: the priced lines, line refunds, and the totals ─────────────────────────────── */}
        <TabsContent value="items" className="grid gap-[34px]">
          <DetailSection
            title="Items"
            subtitle={`${units} unit${units === 1 ? "" : "s"} from your shop, at the price the customer paid.`}
          >
            <ItemsTable detail={detail} canRefund={canRefund} onRefundLine={(id) => openRefund(id)} />
            <Totals detail={detail} />
          </DetailSection>
        </TabsContent>

        {/* ── Fulfilment: picking, then the handoff ──────────────────────────────────────────── */}
        <TabsContent value="fulfilment" className="grid gap-[34px]">
          <DetailSection
            title="Picking"
            subtitle="Record what you've gathered and flag anything that isn't on the shelf."
          >
            <div className="pt-3">
              <PickList fulfillmentId={detail.id} items={detail.lines} status={detail.status} />
            </div>
          </DetailSection>

          <DetailSection title="Handoff" subtitle="How this order leaves your shop and reaches the customer.">
            <FieldGrid>
              <Field label="State" value={STATUS_LABEL[detail.status]} />
              <Field label="Delivery" value={methodText(detail.deliveryMethod)} />
              <Field label="Ready by" value={formatWhen(detail.readyBy)} />
              <Field
                label="Collected by Effy"
                value={detail.handoff.collectedAt ? formatWhen(detail.handoff.collectedAt) : "Not yet"}
              />
              <Field
                label="Delivered"
                value={detail.handoff.deliveredAt ? formatWhen(detail.handoff.deliveredAt) : "Not yet"}
              />
              {detail.handoff.unfulfillableReason ? (
                <Field label="Why it couldn't be supplied" value={detail.handoff.unfulfillableReason} wide />
              ) : null}
              <Field
                label="What happens next"
                wide
                value={
                  <span className="text-muted-foreground">
                    {detail.deliveryMethod === "same_day"
                      ? "An Effy driver collects the package and delivers it to the customer the same day."
                      : "An Effy driver collects the package for the Effy hub; a delivery partner takes it from there."}
                  </span>
                }
              />
            </FieldGrid>
          </DetailSection>
        </TabsContent>
      </Tabs>

      <OrderActivitySheet
        fulfillmentId={detail.id}
        orderNumber={detail.orderNumber}
        open={activityOpen}
        onOpenChange={setActivityOpen}
      />
      <CantSupplyDialog targets={[detail]} open={cancelOpen} onOpenChange={setCancelOpen} />
      <OrderTagsDialog fulfillmentId={detail.id} tags={detail.tags} open={tagsOpen} onOpenChange={setTagsOpen} />
      <OrderNoteDialog fulfillmentId={detail.id} open={noteOpen} onOpenChange={setNoteOpen} />
      {canRefund ? (
        <RefundSheet
          detail={{
            id: detail.id,
            orderId: detail.orderId,
            orderNumber: detail.orderNumber,
            currency: detail.money.currency,
            lines: detail.lines,
          }}
          open={refund.open}
          initialLineId={refund.lineId}
          onOpenChange={(open) => setRefund((r) => ({ ...r, open }))}
        />
      ) : null}
    </Page>
  );
}

function AddressLines({ detail }: { detail: OrderDetail }) {
  const d = detail.delivery;
  return (
    <span className="block">
      <span className="block">{d.line1}</span>
      {d.line2 ? <span className="block">{d.line2}</span> : null}
      <span className="block">
        {d.city}
        {d.region ? ` ${d.region}` : ""} {d.postalCode}
      </span>
      <span className="text-muted-foreground block">{d.country}</span>
    </span>
  );
}

const REFUND_STATUS: Record<string, string> = {
  submitting: "Sending",
  submitted: "With the bank",
  succeeded: "Returned",
  failed: "Failed",
  refused: "Refused",
};

const REFUND_REASON: Record<string, string> = {
  item_not_supplied: "Not supplied",
  item_unusable: "Unusable",
  order_cancelled: "Order cancelled",
  goodwill: "Goodwill",
  external: "Outside the platform",
};

/** Every refund on the order — a genuine data table, so it keeps its row rules. */
function RefundsTable({ detail }: { detail: OrderDetail }) {
  return (
    <div className="pt-[22px]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr className="border-border border-b">
              <HeadCell>Refund</HeadCell>
              <HeadCell>Reason</HeadCell>
              <HeadCell>Status</HeadCell>
              <HeadCell>By</HeadCell>
              <HeadCell align="right">Amount</HeadCell>
            </tr>
          </thead>
          <tbody>
            {detail.refunds.map((r) => (
              <tr key={r.id} className="border-border border-b">
                <td className="text-muted-foreground py-2.5 pr-3 whitespace-nowrap">{formatWhen(r.createdAt)}</td>
                <td className="py-2.5 pr-3">{REFUND_REASON[r.reason] ?? r.reason}</td>
                <td className={cn("py-2.5 pr-3", r.status !== "succeeded" && "font-semibold")}>
                  {REFUND_STATUS[r.status] ?? r.status}
                </td>
                <td className="text-muted-foreground py-2.5 pr-3">{r.actorLabel ?? "—"}</td>
                <td className="py-2.5 text-right font-medium tabular-nums">
                  {formatMoney(r.amount, detail.money.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeadCell({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "text-muted-foreground py-2 pr-3 text-[11.5px] font-medium tracking-[.04em] whitespace-nowrap uppercase last:pr-0",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

/** The line-item table — a real table, with light row rules and a line-level refund. */
function ItemsTable({
  detail,
  canRefund,
  onRefundLine,
}: {
  detail: OrderDetail;
  canRefund: boolean;
  onRefundLine: (orderItemId: string) => void;
}) {
  const currency = detail.money.currency;
  return (
    <div className="overflow-x-auto pt-2">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-border border-b">
            <HeadCell>Product</HeadCell>
            <HeadCell align="right">Qty</HeadCell>
            <HeadCell align="right">Unit price</HeadCell>
            <HeadCell align="right">Line total</HeadCell>
            <HeadCell align="right">Refunded</HeadCell>
            {canRefund ? <th className="w-20" aria-label="Actions" /> : null}
          </tr>
        </thead>
        <tbody>
          {detail.lines.map((l) => {
            const left = refundableQuantity(l);
            return (
              <tr key={l.orderItemId} className="border-border border-b">
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-3">
                    {l.imageUrl ? (
                      <img src={l.imageUrl} alt="" className="border-border size-9 shrink-0 rounded-md border object-cover" />
                    ) : (
                      <div className="border-border bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md border">
                        <ImageOff className="size-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium break-words">{l.name}</div>
                      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="font-mono">{l.sku ?? "no SKU"}</span>
                        <span>
                          {l.unavailableQuantity > 0
                            ? `${l.unavailableQuantity} unavailable`
                            : `${l.gatheredQuantity}/${l.orderedQuantity} picked`}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-3 text-right text-[13px] tabular-nums">{l.orderedQuantity}</td>
                <td className="py-3 pr-3 text-right text-[13px] tabular-nums">{formatMoney(l.unitPrice, currency)}</td>
                <td className="py-3 pr-3 text-right text-[13.5px] font-medium tabular-nums">
                  {formatMoney(l.lineTotal, currency)}
                </td>
                <td className="py-3 pr-3 text-right text-[13px] tabular-nums">
                  {l.refundedQuantity > 0 ? l.refundedQuantity : <span className="text-muted-foreground">—</span>}
                </td>
                {canRefund ? (
                  <td className="py-3 text-right">
                    {left > 0 ? (
                      <SectionAction onClick={() => onRefundLine(l.orderItemId)}>Refund</SectionAction>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The totals beneath the items.
 *
 * ⚠ THEY ADD UP. The table lists THIS shop's lines, the order total covers every shop's, so a
 * two-shop order gets an "Items from other shops" row — without it the lines above would not reconcile
 * with the total below, and an operator checking the arithmetic would find money unaccounted for.
 */
function Totals({ detail }: { detail: OrderDetail }) {
  const m = detail.money;
  const others = Math.round(Number(m.itemSubtotal) * 100) - Math.round(Number(m.shopSubtotal) * 100);
  const rows: { label: ReactNode; value: string; strong?: boolean; rule?: boolean }[] = [
    { label: "Your items", value: formatMoney(m.shopSubtotal, m.currency) },
    ...(others > 0 ? [{ label: "Items from other shops", value: formatMoney((others / 100).toFixed(2), m.currency) }] : []),
    { label: "Delivery", value: formatMoney(m.deliveryFee, m.currency) },
    ...(Number(m.discount) > 0
      ? [{
          label: m.promoCode ? <>Discount <span className="font-mono">{m.promoCode}</span></> : "Discount",
          value: `−${formatMoney(m.discount, m.currency)}`,
        }]
      : []),
    { label: "Total", value: formatMoney(m.total, m.currency), strong: true, rule: true },
    { label: "Refunded", value: Number(m.refunded) > 0 ? `−${formatMoney(m.refunded, m.currency)}` : formatMoney("0", m.currency) },
    { label: "Net", value: formatMoney(m.net, m.currency), strong: true },
  ];
  return (
    <dl className="ml-auto grid w-full max-w-[380px] pt-4">
      {rows.map((r, i) => (
        <div
          key={i}
          className={cn(
            "flex items-baseline justify-between gap-6 py-1 text-[13px]",
            r.rule && "border-border mt-1.5 border-t pt-2.5",
            r.strong && "text-sm font-semibold",
          )}
        >
          <dt className={cn(!r.strong && "text-muted-foreground")}>{r.label}</dt>
          <dd className="tabular-nums whitespace-nowrap">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Previous / next within the list this order was opened from.
 *
 * ⚠ IT READS THE LIST'S OWN CACHED QUERY — same key, same filters — so "3 of 47" is the list the
 * operator just looked at, not a second definition of it. At a page edge it reads the neighbouring page
 * the same way. Opened with no list behind it (a dashboard link) and not on the first page, it shows
 * nothing rather than a position it cannot know.
 */
function OrderNeighbours({
  fulfillmentId,
  search,
  onNavigate,
}: {
  fulfillmentId: string;
  search: OrdersSearch;
  onNavigate?: (fulfillmentId: string, search: OrdersSearch) => void;
}) {
  const list = useQuery({ ...orderListQuery(search), refetchInterval: false });
  const rows = list.data?.items ?? [];
  const index = rows.findIndex((r) => r.id === fulfillmentId);
  const page = list.data?.page ?? 1;
  const pageSize = list.data?.pageSize ?? 25;
  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const needPrev = index === 0 && page > 1;
  const needNext = index >= 0 && index === rows.length - 1 && page < pageCount;
  const prevPage = useQuery({
    ...orderListQuery({ ...search, page: page - 1 }),
    refetchInterval: false,
    enabled: needPrev,
  });
  const nextPage = useQuery({
    ...orderListQuery({ ...search, page: page + 1 }),
    refetchInterval: false,
    enabled: needNext,
  });

  if (index < 0 || !onNavigate) return null;

  const prev =
    index > 0
      ? { id: rows[index - 1]!.id, search }
      : needPrev && prevPage.data?.items.length
        ? { id: prevPage.data.items[prevPage.data.items.length - 1]!.id, search: { ...search, page: page - 1 } }
        : null;
  const next =
    index < rows.length - 1
      ? { id: rows[index + 1]!.id, search }
      : needNext && nextPage.data?.items.length
        ? { id: nextPage.data.items[0]!.id, search: { ...search, page: page + 1 } }
        : null;

  return (
    <div className="-mb-2 flex items-center justify-end gap-1.5">
      <span className="text-muted-foreground mr-1 text-[12.5px] whitespace-nowrap tabular-nums">
        {(page - 1) * pageSize + index + 1} of {total}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="size-7"
        aria-label="Previous order"
        disabled={!prev}
        onClick={() => prev && onNavigate(prev.id, prev.search)}
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-7"
        aria-label="Next order"
        disabled={!next}
        onClick={() => next && onNavigate(next.id, next.search)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
