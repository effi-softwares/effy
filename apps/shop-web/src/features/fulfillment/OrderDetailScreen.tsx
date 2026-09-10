import { useEffect, useState, type ReactNode } from "react";

import { isShopManager } from "@effy/shared-types";
import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";

import { Button, Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";
import { track } from "@/lib/telemetry";
import { cn } from "@/lib/utils";

import { OrderNoteDialog, OrderTagsDialog } from "./components/OrderNotesAndTags";
import { OrderStatusPill, PaymentPill } from "./components/OrderPill";
import { PickList } from "./components/PickList";
import { RefundSheet } from "./components/RefundSheet";
import { CantSupplyDialog, StateActions, stateNote } from "./components/StateControl";
import { canDeclareUnfulfillable } from "./model";
import {
  formatMoney,
  formatWhen,
  methodText,
  paymentMethodText,
  refundableQuantity,
  type OrderDetail,
  type OrderLine,
  type OrdersSearch,
} from "./orderConsole";
import { orderActivityQuery, orderDetailQuery, orderListQuery } from "./queries";

/**
 * Order detail — transcribed from the imported design's `isOrderDetail` block ("Effy Shop
 * Console.dc.html"): the position + previous/next row; the sticky summary bar (total, status, payment
 * and risk pills, placed line, actions); then two columns — Items (lines, totals, the refunded box),
 * Fulfilment, Internal notes and the Activity log on the left; the Payment card, the action stack,
 * Tags, Customer, Ship to and Bill to in the right rail.
 *
 * ⚠ WHERE IT DEPARTS FROM THE MOCKUP, IT IS BECAUSE THE PLATFORM CANNOT DO THE THING, not for taste:
 *   • CAPTURE — Effy captures at payment (`CaptureMethod: automatic`, 055 R3). The design shows the
 *     button only while an order is authorised-but-uncaptured, which no Effy order ever is, so it never
 *     renders.
 *   • "VAT 25%" — per-item GST is unmodelled (052 R13); no tax row is drawn.
 *   • DUPLICATE / RESEND EMAIL / PRINT INVOICE / EDIT ORDER — an order is a paid record (055), the
 *     receipt is the customer's to resend, and the platform cannot issue a tax invoice (052 FR-031).
 *   • SHIPMENTS, CARRIER, TRACKING, RETURNS — a shop hands its package to an Effy driver (049) and there
 *     is no returns model. The Fulfilment section carries picking and the driver handoff instead.
 *   • CUSTOMER EMAIL, ORDER COUNT, LTV, BILLING ADDRESS — never shared with a shop (023 FR-018).
 *   • "Cancel order" is the can't-supply declaration — a shop cannot cancel a customer's order.
 * `__tests__/order-detail.test.tsx` reads this directory's source and fails naming the file if a
 * forbidden control reappears.
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
  const { data, error, isPending, isError, refetch } = useQuery(orderDetailQuery(fulfillmentId));
  const { data: session } = useQuery(sessionQuery);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  // Keyed on the portion id — "the operator opened this order", once per open.
  const openedStatus = data?.status;
  useEffect(() => {
    if (!openedStatus) return;
    track({ name: "shop_order_opened", fulfillmentId, status: openedStatus });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per portion, not per status change
  }, [fulfillmentId]);

  // ⚠ FR-014b — a courtesy, not the gate. The backend decides from the platform record.
  const canRefund = session?.status === "signed-in" && isShopManager(session.identity.roles);

  const nav = <OrderNeighbours fulfillmentId={fulfillmentId} search={search} onNavigate={onNavigate} />;

  if (isError) {
    return (
      <div className="grid gap-5">
        {nav}
        <ErrorState
          error={error}
          onRetry={() => void refetch()}
          forbiddenMessage="This order isn't available to your shop."
        />
      </div>
    );
  }
  if (isPending) {
    return (
      <div className="grid gap-5">
        {nav}
        <Skeleton className="h-[62px] w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const detail: OrderDetail = data;
  const currency = detail.money.currency;
  const units = detail.lines.reduce((n, l) => n + l.orderedQuantity, 0);
  const refundable = canRefund && detail.lines.some((l) => refundableQuantity(l) > 0);

  return (
    <div className="grid gap-5">
      {nav}

      {/* ── The sticky summary bar. `top-14` clears the 56px header exactly. ─────────────────── */}
      <div className="border-border bg-background sticky top-14 z-[4] flex flex-wrap items-center gap-3 rounded-[var(--radius)] border px-4 py-3">
        <div className="grid min-w-0 gap-[7px]">
          <div className="flex flex-wrap items-center gap-2 gap-y-1.5">
            <span className="text-base font-semibold tracking-[-.02em] tabular-nums">
              {formatMoney(detail.money.total, currency)}
            </span>
            <OrderStatusPill status={detail.status} />
            <PaymentPill state={detail.payment.state} />
            {detail.atRisk ? (
              <span className="border-destructive text-destructive rounded-full border px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap">
                At risk
              </span>
            ) : null}
          </div>
          <div className="text-muted-foreground text-[12.5px]">
            Placed {formatWhen(detail.placedAt)} · {methodText(detail.deliveryMethod)} delivery · ready by{" "}
            {formatWhen(detail.readyBy)}
          </div>
        </div>
        <div className="min-w-3 flex-1" />
        <div className="flex flex-wrap gap-2">
          <StateActions detail={detail} />
        </div>
      </div>

      <div className="grid items-start gap-9 min-[1060px]:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        {/* ── Main column ─────────────────────────────────────────────────────────────────────── */}
        <div className="grid min-w-0 gap-7">
          <div>
            <SectionHead
              title="Items"
              meta={`${units} unit${units === 1 ? "" : "s"} · ${methodText(detail.deliveryMethod)} delivery`}
            />
            <ItemsTable detail={detail} />
            {detail.refunds.length > 0 ? <RefundedBox detail={detail} /> : null}
          </div>

          <div>
            <SectionHead title="Fulfilment" />
            <PickList fulfillmentId={detail.id} items={detail.lines} status={detail.status} />
            <Handoff detail={detail} />
          </div>

          <div>
            <SectionHead title="Internal notes" action={{ label: "Add note", onClick: () => setNoteOpen(true) }} />
            {detail.notes.length === 0 ? (
              <div className="text-muted-foreground py-3.5 text-[13px]">No notes yet.</div>
            ) : (
              detail.notes.map((n) => (
                <div key={n.id} className="border-border grid gap-1 border-b py-3">
                  <div className="text-[13.5px] leading-[1.55] whitespace-pre-line text-pretty">{n.body}</div>
                  <div className="text-muted-foreground text-[12px]">
                    {n.authorLabel ? `${n.authorLabel} · ` : ""}
                    {formatWhen(n.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>

          <ActivityLog fulfillmentId={detail.id} />
        </div>

        {/* ── The rail ───────────────────────────────────────────────────────────────────────── */}
        <div className="grid min-w-0 gap-6">
          <div className="border-border grid gap-3 rounded-[var(--radius)] border p-3.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <MicroLabel>Payment</MicroLabel>
              <PaymentPill state={detail.payment.state} />
            </div>
            <div className="text-muted-foreground text-[13px]">
              {paymentMethodText(detail.payment)} · {formatMoney(detail.payment.amount, currency)} captured at
              checkout
            </div>
            {refundable ? (
              <div className="grid gap-2">
                <Button
                  variant="outline"
                  className="h-[34px] text-[13.5px]"
                  onClick={() => setRefundOpen(true)}
                >
                  Refund
                </Button>
              </div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Button variant="outline" className="h-9 text-[13.5px]" onClick={() => printPickList(detail)}>
              Print pick list
            </Button>
            {canDeclareUnfulfillable(detail.status) ? (
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive h-9 text-[13.5px]"
                onClick={() => setCancelOpen(true)}
              >
                Can&apos;t supply this order
              </Button>
            ) : null}
          </div>

          <div className="grid gap-2">
            <div className="flex items-baseline justify-between gap-2.5">
              <MicroLabel>Tags</MicroLabel>
              <LinkButton small onClick={() => setTagsOpen(true)}>
                Edit
              </LinkButton>
            </div>
            {detail.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {detail.tags.map((t) => (
                  <span
                    key={t}
                    className="border-border bg-muted rounded-full border px-[9px] py-0.5 text-[12px] whitespace-nowrap"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4">
            <div className="border-border grid gap-1 border-b pb-4">
              <MicroLabel>Customer</MicroLabel>
              <div className="text-[13.5px] font-medium">{detail.delivery.recipientName || "—"}</div>
              {detail.delivery.phone ? (
                <div className="text-muted-foreground text-[13px]">{detail.delivery.phone}</div>
              ) : null}
            </div>
            <div className="border-border grid gap-1 border-b pb-4">
              <MicroLabel>Ship to</MicroLabel>
              <div className="text-[13px] leading-[1.6] whitespace-pre-line">{addressText(detail)}</div>
            </div>
            <div className="grid gap-1">
              <MicroLabel>Bill to</MicroLabel>
              {/* ⚠ Named and said to be withheld, not silently missing (023 FR-018). */}
              <div className="text-muted-foreground text-[13px] leading-[1.6]">Held by Effy with the payment.</div>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────────────────────────

function MicroLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground text-[11.5px] font-medium tracking-[.04em] whitespace-nowrap uppercase">
      {children}
    </div>
  );
}

/** The design's bare text action: muted, 13px/500, darkens on hover. */
function LinkButton({ children, onClick, small }: { children: ReactNode; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-muted-foreground hover:text-foreground focus-visible:ring-ring cursor-pointer rounded-sm border-none bg-transparent p-0 font-medium focus-visible:ring-2 focus-visible:outline-none",
        small ? "text-[12.5px]" : "text-[13px]",
      )}
    >
      {children}
    </button>
  );
}

/** A main-column section header: title, muted meta, the action on the right, one hairline under. */
function SectionHead({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="border-border flex flex-wrap items-baseline gap-2.5 border-b pb-2.5">
      <h2 className="text-[13.5px] font-semibold">{title}</h2>
      {meta ? <div className="text-muted-foreground text-[12.5px]">{meta}</div> : null}
      <div className="flex-1" />
      {action ? <LinkButton onClick={action.onClick}>{action.label}</LinkButton> : null}
    </div>
  );
}

function pickedText(l: OrderLine): { text: string; className: string } {
  if (l.unavailableQuantity > 0) {
    return { text: `${l.unavailableQuantity} unavailable`, className: "text-destructive" };
  }
  if (l.gatheredQuantity >= l.orderedQuantity) return { text: "Picked", className: "text-foreground" };
  if (l.gatheredQuantity > 0) return { text: "Part picked", className: "text-muted-foreground" };
  return { text: "Not picked", className: "text-muted-foreground" };
}

/**
 * The line table and the totals under it.
 *
 * ⚠ THE TOTALS ADD UP. The rows are THIS shop's lines and the total is the whole order's, so a two-shop
 * order gets an "Items from other shops" row — without it the lines would not reconcile with the total.
 */
function ItemsTable({ detail }: { detail: OrderDetail }) {
  const m = detail.money;
  const currency = m.currency;
  const others = Math.round(Number(m.itemSubtotal) * 100) - Math.round(Number(m.shopSubtotal) * 100);
  return (
    <table className="w-full border-collapse">
      <tbody>
        {detail.lines.map((l) => {
          const picked = pickedText(l);
          return (
            <tr key={l.orderItemId} className="border-border border-b">
              <td className="w-11 py-3 pr-2">
                {l.imageUrl ? (
                  <img src={l.imageUrl} alt="" className="border-border size-9 rounded-md border object-cover" />
                ) : (
                  <div className="border-border bg-muted text-muted-foreground grid size-9 place-items-center rounded-md border">
                    <ImageOff className="size-4" />
                  </div>
                )}
              </td>
              <td className="px-2 py-3">
                <div className="text-[13.5px] font-medium">{l.name}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground font-mono text-[12px] whitespace-nowrap">{l.sku ?? "no SKU"}</span>
                  <span className={cn("text-[11.5px] whitespace-nowrap", picked.className)}>{picked.text}</span>
                  {l.refundedQuantity > 0 ? (
                    <span className="text-muted-foreground text-[11.5px] whitespace-nowrap">
                      {l.refundedQuantity} refunded
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="text-muted-foreground px-2 py-3 text-right text-[13px] whitespace-nowrap">
                {l.orderedQuantity} × {formatMoney(l.unitPrice, currency)}
              </td>
              <td className="w-[110px] py-3 pl-2 text-right text-[13.5px] font-medium tabular-nums">
                {formatMoney(l.lineTotal, currency)}
              </td>
            </tr>
          );
        })}
        <TotalRow label="Subtotal" value={formatMoney(m.shopSubtotal, currency)} first />
        {others > 0 ? (
          <TotalRow label="Items from other shops" value={formatMoney((others / 100).toFixed(2), currency)} />
        ) : null}
        {Number(m.discount) > 0 ? (
          <TotalRow
            label={
              <>
                Discount {m.promoCode ? <span className="font-mono">{m.promoCode}</span> : null}
              </>
            }
            value={`−${formatMoney(m.discount, currency)}`}
          />
        ) : null}
        <TotalRow label="Delivery" value={formatMoney(m.deliveryFee, currency)} last />
        <tr className="border-border border-t">
          <td colSpan={3} className="pt-2.5 pr-2 text-sm font-semibold">
            Total
          </td>
          <td className="pt-2.5 text-right text-sm font-semibold whitespace-nowrap tabular-nums">
            {formatMoney(m.total, currency)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function TotalRow({
  label,
  value,
  first,
  last,
}: {
  label: ReactNode;
  value: string;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <tr>
      <td
        colSpan={3}
        className={cn("text-muted-foreground pr-2 text-[13px]", first ? "pt-[9px] pb-[3px]" : last ? "pt-[3px] pb-2.5" : "py-[3px]")}
      >
        {label}
      </td>
      <td
        className={cn(
          "text-right text-[13px] whitespace-nowrap tabular-nums",
          first ? "pt-[9px] pb-[3px]" : last ? "pt-[3px] pb-2.5" : "py-[3px]",
        )}
      >
        {value}
      </td>
    </tr>
  );
}

const REFUND_STATUS: Record<string, string> = {
  submitting: "sending",
  submitted: "with the bank",
  succeeded: "returned",
  failed: "failed",
  refused: "refused",
};

const REFUND_REASON: Record<string, string> = {
  item_not_supplied: "Not supplied",
  item_unusable: "Unusable",
  order_cancelled: "Order cancelled",
  goodwill: "Goodwill",
  external: "Outside the platform",
};

/** The design's "Refunded" box under the items: the total, each refund, and what was paid net. */
function RefundedBox({ detail }: { detail: OrderDetail }) {
  const m = detail.money;
  return (
    <div className="border-border mt-3.5 grid gap-2.5 rounded-[var(--radius)] border px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[13px] font-semibold">Refunded</div>
        <div className="text-destructive text-[13.5px] font-semibold whitespace-nowrap tabular-nums">
          −{formatMoney(m.refunded, m.currency)}
        </div>
      </div>
      {detail.refunds.map((r) => (
        <div key={r.id} className="border-border flex items-baseline justify-between gap-3 border-t pt-2">
          <div className="text-muted-foreground text-[12.5px]">
            {REFUND_REASON[r.reason] ?? r.reason} · {formatWhen(r.createdAt)} · {REFUND_STATUS[r.status] ?? r.status}
            {r.actorLabel ? ` · ${r.actorLabel}` : ""}
          </div>
          <div className="text-[12.5px] whitespace-nowrap tabular-nums">{formatMoney(r.amount, m.currency)}</div>
        </div>
      ))}
      <div className="border-border flex items-baseline justify-between gap-3 border-t pt-2">
        <div className="text-[13px] font-semibold">Net paid</div>
        <div className="text-[13px] font-semibold whitespace-nowrap tabular-nums">{formatMoney(m.net, m.currency)}</div>
      </div>
    </div>
  );
}

/** Where the package goes after the shelf — the design's shipment rows, in Effy's hub-and-spoke terms. */
function Handoff({ detail }: { detail: OrderDetail }) {
  const remaining = detail.lines.reduce(
    (n, l) => n + Math.max(0, l.orderedQuantity - l.gatheredQuantity - l.unavailableQuantity),
    0,
  );
  const note = stateNote(detail.status);
  const rows: { title: string; meta: string }[] = [];
  if (detail.handoff.collectedAt) {
    rows.push({ title: "Collected by an Effy driver", meta: formatWhen(detail.handoff.collectedAt) });
  }
  if (detail.handoff.deliveredAt) {
    rows.push({ title: "Delivered to the customer", meta: formatWhen(detail.handoff.deliveredAt) });
  }
  if (detail.handoff.unfulfillableReason) {
    rows.push({ title: `Can't supply — ${detail.handoff.unfulfillableReason}`, meta: "" });
  }
  return (
    <>
      {rows.map((r) => (
        <div
          key={r.title}
          className="border-border flex flex-wrap items-baseline justify-between gap-3 border-b py-3"
        >
          <div className="text-[13.5px] font-medium">{r.title}</div>
          <div className="text-muted-foreground text-[12.5px] whitespace-nowrap">{r.meta}</div>
        </div>
      ))}
      <div className="text-muted-foreground py-3.5 text-[13px]">
        {remaining > 0 && (detail.status === "received" || detail.status === "picking" || detail.status === "pending")
          ? `${remaining} unit${remaining === 1 ? "" : "s"} still to pick.`
          : (note ??
            (detail.deliveryMethod === "same_day"
              ? "An Effy driver collects it and delivers it the same day."
              : "An Effy driver collects it for the hub; a delivery partner takes it from there."))}
      </div>
    </>
  );
}

/**
 * The Activity log — in the page, as the design has it: a dot on a rail per entry, the entry on the
 * left and "who · when" on the right. It is the full history (events, refunds, collection, arrival).
 *
 * ⚠ THE DOT IS MONOCHROME: the design colours it by kind, which needs a third hue (Principle V). A
 * decision-bearing entry takes the foreground; routine progress the muted tone. The title says which.
 */
function ActivityLog({ fulfillmentId }: { fulfillmentId: string }) {
  const log = useQuery(orderActivityQuery(fulfillmentId));
  return (
    <div>
      <div className="border-border border-b pb-3 text-[13.5px] font-semibold">Activity log</div>
      <div className="pt-3.5">
        {log.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : log.isError ? (
          <div className="text-muted-foreground text-[13px]">The activity couldn&apos;t be loaded.</div>
        ) : log.data.entries.length === 0 ? (
          <div className="text-muted-foreground text-[13px]">Nothing recorded yet.</div>
        ) : (
          log.data.entries.map((e, i) => (
            <div key={e.id} className="grid grid-cols-[14px_1fr] gap-3">
              <div className="flex flex-col items-center">
                <div
                  aria-hidden="true"
                  className={cn(
                    "mt-[5px] size-[7px] shrink-0 rounded-full",
                    e.tone === "strong" ? "bg-foreground" : "bg-muted-foreground/60",
                  )}
                />
                {i < log.data.entries.length - 1 ? (
                  <div aria-hidden="true" className="bg-border w-px flex-1" />
                ) : null}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-3 pb-4">
                <div className="text-[13.5px] font-medium text-pretty">{e.title}</div>
                <div className="text-muted-foreground text-[12px] whitespace-nowrap">
                  {e.actorLabel ? `${e.actorLabel} · ` : ""}
                  {formatWhen(e.at)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function addressText(detail: OrderDetail): string {
  const d = detail.delivery;
  return [
    d.recipientName,
    d.line1,
    d.line2,
    [d.city, d.region, d.postalCode].filter(Boolean).join(" "),
    d.country,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * "Print pick list" — a plain printable list of this shop's lines, opened in its own window so the
 * console's chrome never reaches the printer. Only what a picker needs: the order, the lines, the SKUs.
 */
function printPickList(detail: OrderDetail) {
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const rows = detail.lines
    .map(
      (l) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #ddd">☐</td><td style="padding:8px;border-bottom:1px solid #ddd">${esc(l.name)}</td><td style="padding:8px;border-bottom:1px solid #ddd;font-family:monospace">${esc(l.sku ?? "")}</td><td style="padding:8px 0;border-bottom:1px solid #ddd;text-align:right">${l.orderedQuantity}</td></tr>`,
    )
    .join("");
  w.document.write(
    `<!doctype html><title>Pick list ${esc(detail.orderNumber)}</title><body style="font:14px system-ui;margin:32px"><h1 style="font-size:18px;margin:0 0 4px">Pick list · <span style="font-family:monospace">${esc(detail.orderNumber)}</span></h1><p style="color:#666;margin:0 0 16px">${esc(detail.delivery.recipientName)} · ${esc(methodText(detail.deliveryMethod))} delivery · ready by ${esc(formatWhen(detail.readyBy))}</p><table style="width:100%;border-collapse:collapse">${rows}</table></body>`,
  );
  w.document.close();
  w.focus();
  w.print();
}

/**
 * Position + previous / next within the list this order was opened from — the design's top row.
 *
 * ⚠ IT READS THE LIST'S OWN CACHED QUERY (same key, same filters), so "3 of 47" is the list the
 * operator just looked at. At a page edge it reads the neighbouring page the same way. Opened with no
 * list behind it (a dashboard link) and not on the first page, it shows nothing rather than guess.
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
  const prevPage = useQuery({ ...orderListQuery({ ...search, page: page - 1 }), refetchInterval: false, enabled: needPrev });
  const nextPage = useQuery({ ...orderListQuery({ ...search, page: page + 1 }), refetchInterval: false, enabled: needNext });

  const prev =
    index > 0
      ? { id: rows[index - 1]!.id, search }
      : needPrev && prevPage.data?.items.length
        ? { id: prevPage.data.items[prevPage.data.items.length - 1]!.id, search: { ...search, page: page - 1 } }
        : null;
  const next =
    index >= 0 && index < rows.length - 1
      ? { id: rows[index + 1]!.id, search }
      : needNext && nextPage.data?.items.length
        ? { id: nextPage.data.items[0]!.id, search: { ...search, page: page + 1 } }
        : null;

  const known = index >= 0 && !!onNavigate;
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[13px]">
      <div className="flex-1" />
      {known ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] whitespace-nowrap tabular-nums">
            {(page - 1) * pageSize + index + 1} of {total}
          </span>
          <NavButton label="Previous order" disabled={!prev} onClick={() => prev && onNavigate!(prev.id, prev.search)}>
            ←
          </NavButton>
          <NavButton label="Next order" disabled={!next} onClick={() => next && onNavigate!(next.id, next.search)}>
            →
          </NavButton>
        </div>
      ) : null}
    </div>
  );
}

function NavButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="border-input bg-background text-foreground hover:bg-accent size-7 cursor-pointer rounded-md border text-[12px] disabled:cursor-default disabled:opacity-45"
    >
      {children}
    </button>
  );
}
