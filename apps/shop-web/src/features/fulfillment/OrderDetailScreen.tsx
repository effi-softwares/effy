import { useEffect, useState, type ReactNode } from "react";

import { isShopManager } from "@effy/shared-types";
import { useQuery } from "@tanstack/react-query";

import { Button, Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";
import { track } from "@/lib/telemetry";
import { cn } from "@/lib/utils";

import { ItemsAndFulfilment } from "./components/ItemsAndFulfilment";
import { OrderActivitySheet } from "./components/OrderActivitySheet";
import { OrderNoteDialog, OrderTagsDialog } from "./components/OrderNotesAndTags";
import { OrderStatusPill, PaymentPill } from "./components/OrderPill";
import { RefundSheet } from "./components/RefundSheet";
import { CantSupplyDialog, StateActions } from "./components/StateControl";
import { canDeclareUnfulfillable } from "./model";
import {
  formatMoney,
  formatWhen,
  methodText,
  paymentMethodText,
  refundableQuantity,
  type OrderDetail,
} from "./orderConsole";
import { orderDetailQuery } from "./queries";

/**
 * Order detail — the imported design's `isOrderDetail` block, revision 2 (057 A3): the sticky summary
 * bar; a two-column grid (the content column — "Items and fulfilment", then "Internal notes" — beside a
 * narrow column holding ONLY the payment card and the action buttons); then "Customer and delivery"
 * full width beneath. The activity log is a right-side sheet opened from "Activity". Order pagination
 * lives in the app header (`HeaderChrome`), never here.
 *
 * ⚠ WHERE IT DEPARTS FROM THE MOCKUP, IT IS BECAUSE THE PLATFORM CANNOT DO THE THING, not for taste:
 *   • CAPTURE — Effy captures at payment (055 R3), so the design's capture button never has an
 *     authorised-but-uncaptured order to act on.
 *   • "VAT 25%" — per-item GST is unmodelled (052 R13); no tax row is drawn.
 *   • DUPLICATE / RESEND EMAIL / PRINT INVOICE / EDIT ORDER — an order is a paid record (055), the
 *     receipt resend is the customer's own route (052), and the platform cannot issue a tax invoice.
 *   • CARRIER / TRACKING / RECORD A RETURN — a shop hands its package to an Effy driver (049) and the
 *     platform has no returns model; "Fulfil" hands the package over instead.
 *   • CUSTOMER EMAIL, "CUSTOMER SINCE", BILLING ADDRESS — never shared with a shop (023 FR-018).
 *   • "Cancel order" opens the can't-supply declaration — a shop cannot cancel a customer's order.
 * `__tests__/order-detail.test.tsx` reads this directory's source and fails naming the file if a
 * forbidden control reappears.
 *
 * ⚠ Opening this screen IS the acknowledgement (020 FR-011a).
 */
export function OrderDetailScreen({ fulfillmentId }: { fulfillmentId: string }) {
  const { data, error, isPending, isError, refetch } = useQuery(orderDetailQuery(fulfillmentId));
  const { data: session } = useQuery(sessionQuery);
  const [activityOpen, setActivityOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  const openedStatus = data?.status;
  useEffect(() => {
    if (!openedStatus) return;
    track({ name: "shop_order_opened", fulfillmentId, status: openedStatus });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per portion, not per status change
  }, [fulfillmentId]);

  // ⚠ FR-014b — a courtesy, not the gate. The backend decides from the platform record.
  const canRefund = session?.status === "signed-in" && isShopManager(session.identity.roles);

  if (isError) {
    return (
      <ErrorState
        error={error}
        onRetry={() => void refetch()}
        forbiddenMessage="This order isn't available to your shop."
      />
    );
  }
  if (isPending) {
    return (
      <div className="grid gap-7">
        <Skeleton className="h-[62px] w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const detail: OrderDetail = data;
  const currency = detail.money.currency;
  const refundable = canRefund && detail.lines.some((l) => refundableQuantity(l) > 0);

  return (
    <div className="grid gap-7">
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
          {/* Every Effy order is placed online — the storefront or the app — so that is its channel. */}
          <div className="text-muted-foreground text-[12.5px]">{formatWhen(detail.placedAt)} · Online store</div>
        </div>
        <div className="min-w-3 flex-1" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-8 px-[11px] text-[13px]" onClick={() => setActivityOpen(true)}>
            Activity
          </Button>
          <StateActions detail={detail} />
        </div>
      </div>

      <div className="grid items-start gap-14 min-[1060px]:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        {/* ── Content column: 52px between sections ───────────────────────────────────────────── */}
        <div className="grid min-w-0 gap-[52px]">
          <ItemsAndFulfilment detail={detail} />

          <section>
            <div className="border-border flex items-baseline gap-2.5 border-b pb-3">
              <h2 className="text-[15px] font-semibold tracking-[-.01em]">Internal notes</h2>
              <div className="flex-1" />
              <TextButton onClick={() => setNoteOpen(true)}>Add note</TextButton>
            </div>
            {detail.notes.length === 0 ? (
              <div className="text-muted-foreground py-5 text-[13px]">No notes on this order yet.</div>
            ) : (
              detail.notes.map((n) => (
                <div key={n.id} className="border-border grid gap-[5px] border-b py-4">
                  <div className="text-[13.5px] leading-[1.55] whitespace-pre-line text-pretty">{n.body}</div>
                  <div className="text-muted-foreground text-[12px]">
                    {n.authorLabel ? `${n.authorLabel} · ` : ""}
                    {formatWhen(n.createdAt)}
                  </div>
                </div>
              ))
            )}
          </section>
        </div>

        {/* ── The narrow column: the payment card and the action buttons, nothing else ─────────── */}
        <div className="grid min-w-0 gap-7">
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
                <Button variant="outline" className="h-[34px] text-[13.5px]" onClick={() => setRefundOpen(true)}>
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
                Cancel order
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Customer and delivery — full width, below the grid ────────────────────────────────── */}
      <section>
        <div className="border-border grid gap-1 border-b pb-3.5">
          <h2 className="text-[15px] font-semibold tracking-[-.01em]">Customer and delivery</h2>
          {/* ⚠ The design's "Customer since {date}" is account history, which a shop is not given. */}
          <p className="text-muted-foreground text-[12.5px]">
            {methodText(detail.deliveryMethod)} delivery · ready by {formatWhen(detail.readyBy)}
          </p>
        </div>
        <div
          className="grid gap-10 pt-6"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}
        >
          <Block label="Customer">
            <div className="text-[13.5px] font-medium">{detail.delivery.recipientName || "—"}</div>
            {detail.delivery.phone ? (
              <div className="text-muted-foreground text-[13px]">{detail.delivery.phone}</div>
            ) : null}
          </Block>
          <Block label="Ship to">
            <div className="text-[13px] leading-[1.6] whitespace-pre-line">{addressText(detail)}</div>
          </Block>
          <Block label="Bill to">
            {/* ⚠ Named and said to be withheld, not silently missing (023 FR-018). */}
            <div className="text-muted-foreground text-[13px] leading-[1.6]">Held by Effy with the payment.</div>
          </Block>
          <div className="grid content-start gap-2">
            <div className="flex items-baseline gap-2.5">
              <MicroLabel>Tags</MicroLabel>
              <TextButton small onClick={() => setTagsOpen(true)}>
                Edit
              </TextButton>
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
            ) : (
              <div className="text-muted-foreground text-[13px]">No tags.</div>
            )}
          </div>
        </div>
      </section>

      <OrderActivitySheet fulfillmentId={detail.id} open={activityOpen} onOpenChange={setActivityOpen} />
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

function MicroLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground text-[11.5px] font-medium tracking-[.04em] whitespace-nowrap uppercase">
      {children}
    </div>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1">
      <MicroLabel>{label}</MicroLabel>
      {children}
    </div>
  );
}

function TextButton({ children, onClick, small }: { children: ReactNode; onClick: () => void; small?: boolean }) {
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

function addressText(detail: OrderDetail): string {
  const d = detail.delivery;
  return [d.recipientName, d.line1, d.line2, [d.city, d.region, d.postalCode].filter(Boolean).join(" "), d.country]
    .filter(Boolean)
    .join("\n");
}

/**
 * "Print pick list" — a plain printable list of this shop's lines in its own window, so the console's
 * chrome never reaches the printer.
 */
function printPickList(detail: OrderDetail) {
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return;
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
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
