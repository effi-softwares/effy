import { useEffect, useState } from "react";

import { isShopManager } from "@effy/shared-types";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Undo2 } from "lucide-react";

import { Button, Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import {
  Crumbs,
  DetailRow,
  MicroLabel,
  Page,
  Pill,
  Section,
} from "@/components/console/primitives";
import { sessionQuery } from "@/features/auth/queries";
import { track } from "@/lib/telemetry";

import { FulfillmentStatusBadge } from "./components/FulfillmentStatusBadge";
import { PickList } from "./components/PickList";
import { RefundSheet } from "./components/RefundSheet";
import { StateControl } from "./components/StateControl";
import { formatTime, STATUS_LABEL, type FulfillmentDetail } from "./model";
import { fulfillmentDetailQuery } from "./queries";

/**
 * The pick screen (US2/US3), rebuilt to the imported design (057).
 *
 * ⚠ FOUR OF THE MOCKUP'S OWN BLOCKS ARE DELIBERATELY ABSENT, and this is the screen where its generic
 * e-commerce assumptions diverge hardest from Effy's model:
 *
 *   • ITS MONEY BLOCK — subtotal, discount, shipping, "VAT 25%", total. A shop portion carries no
 *     order-level money at all (020 FR-007/FR-008, SC-007): the backend's projection does not select
 *     it, so the omission here is structural rather than a rendering choice. And the VAT line is
 *     Swedish; Australian grocery is a MIXED supply where most items are GST-free (052 R13).
 *   • ITS "Capture" BUTTON — Effy captures at payment (`CaptureMethod: automatic`, 055 R3). There is
 *     no later capture, and a button implying one suggests money is being held that is not.
 *   • ITS "Duplicate" AND "Edit order" — an order is a paid financial record. 055 is explicit that
 *     `order_item` and `payment` are untouched by a refund: "the receipt is a historical record of
 *     what was charged; a refund is a later row, never an edit."
 *   • ITS "Print invoice" — the platform cannot issue a tax invoice at all: the ABN is unsupplied and
 *     per-item GST treatment is unmodelled, so `canIssueTaxInvoice()` is false by design (052 FR-031).
 *
 * `__tests__/order-detail.test.tsx` reads this directory's source and fails naming the file if any of
 * them reappears. What IS adopted: the sticky action bar, the mono breadcrumb, the two-column body,
 * the item table's shape, the activity timeline and the right rail.
 *
 * ⚠ Opening this screen IS the acknowledgement — a `pending` portion becomes `received` as a side
 * effect of the read (FR-011a), which is why there is no "acknowledge" button anywhere.
 */
export function OrderDetailScreen({ fulfillmentId }: { fulfillmentId: string }) {
  const { data, error, isPending, isError, refetch } = useQuery(
    fulfillmentDetailQuery(fulfillmentId),
  );
  const { data: session } = useQuery(sessionQuery);
  const [refundOpen, setRefundOpen] = useState(false);
  const navigate = useNavigate();

  const goOrders = () => void navigate({ to: "/orders" });

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

  if (isError) {
    return (
      <Page>
        <Crumbs parent="Orders" onParent={goOrders} current="Order" />
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
        <Crumbs parent="Orders" onParent={goOrders} current="Loading…" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }

  const detail: FulfillmentDetail = data;
  const shortfall = detail.items.reduce((n, i) => n + i.unavailableQuantity, 0);
  const gathered = detail.items.reduce((n, i) => n + i.gatheredQuantity, 0);
  const ordered = detail.items.reduce((n, i) => n + i.orderedQuantity, 0);

  return (
    <Page className="gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Crumbs parent="Orders" onParent={goOrders} current={detail.orderNumber} />
      </div>

      {/* ── The mockup's sticky action bar. `top-14` clears the 56px header exactly. ───────────── */}
      <div className="bg-background border-border sticky top-14 z-[4] flex flex-wrap items-center gap-3 rounded-[var(--radius)] border px-4 py-3">
        <div className="grid min-w-0 gap-[7px]">
          <div className="flex flex-wrap items-center gap-2 gap-y-1.5">
            {/* ⚠ Where the mockup puts the order TOTAL, this puts pick progress — the number this
                screen is actually about, and the only one a shop is permitted to see. */}
            <span className="text-base font-semibold tracking-[-.02em] tabular-nums">
              {gathered}/{ordered} picked
            </span>
            <FulfillmentStatusBadge status={detail.status} />
            <Pill variant="quiet">{detail.promise.serviceLevel}</Pill>
            {detail.items.some((i) => i.unavailableQuantity > 0) ? (
              <Pill variant="strong">{shortfall} short</Pill>
            ) : null}
          </div>
          <div className="text-muted-foreground text-[12.5px]">
            Arrived {formatTime(detail.placedAt)} · ready by {formatTime(detail.promise.readyBy)}
          </div>
        </div>

        <div className="min-w-3 flex-1" />

        <div className="flex flex-wrap items-center gap-2">
          {canRefund ? (
            <Button variant="outline" size="sm" className="h-8" onClick={() => setRefundOpen(true)}>
              <Undo2 />
              Refund items
            </Button>
          ) : null}
          <StateControl detail={detail} onReload={() => void refetch()} />
        </div>
      </div>

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
              recorded — nothing is refunded or adjusted here.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── The mockup's two-column body ───────────────────────────────────────────────────────── */}
      <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="grid min-w-0 gap-7">
          <Section
            title={
              <span className="flex flex-wrap items-baseline gap-2.5">
                Items
                <span className="text-muted-foreground text-[12.5px] font-normal">
                  {ordered} units · {detail.promise.serviceLevel}
                </span>
              </span>
            }
          >
            <div className="pt-3">
              <PickList fulfillmentId={detail.id} items={detail.items} status={detail.status} />
            </div>
          </Section>

          <OrderActivity detail={detail} />
        </div>

        <aside className="grid min-w-0 gap-6">
          {/* ⚠ The mockup's rail leads with a PAYMENT card carrying a capture button. Neither exists
              here: a shop portion has no payment of its own, and refunding is the one money action a
              shop can take — it lives in the action bar above, where the operator already is. */}
          <div className="border-border grid gap-3 rounded-[var(--radius)] border p-3.5">
            <MicroLabel>Deliver to</MicroLabel>
            <div className="text-[13.5px] leading-[1.55]">
              <div className="font-medium">{detail.delivery.recipientName}</div>
              <div className="text-muted-foreground">
                {detail.delivery.line1}
                {detail.delivery.line2 ? `, ${detail.delivery.line2}` : ""}
              </div>
              <div className="text-muted-foreground">
                {detail.delivery.city} {detail.delivery.postalCode}
              </div>
              <div className="text-muted-foreground">{detail.delivery.country}</div>
            </div>
          </div>

          <div className="grid gap-0">
            <MicroLabel className="pb-2.5">Details</MicroLabel>
            <DetailRow label="Phone" value={detail.delivery.phone ?? "—"} />
            <DetailRow label="Region" value={detail.delivery.region ?? "—"} />
            <DetailRow label="Lines" value={detail.items.length} />
            <DetailRow label="State" value={STATUS_LABEL[detail.status]} />
          </div>
        </aside>
      </div>

      {canRefund ? (
        <RefundSheet detail={detail} open={refundOpen} onOpenChange={setRefundOpen} />
      ) : null}
    </Page>
  );
}

/**
 * The mockup's activity timeline — a dotted rail down the left with one entry per event.
 *
 * ⚠ IT IS DERIVED FROM WHAT THIS SCREEN ALREADY KNOWS, not from a new endpoint. The shop's fulfilment
 * contract carries `placedAt`, `stateChangedAt` and the per-line progress; a dedicated event feed
 * would be a second source for facts already on screen, free to disagree with the badge three
 * pixels away. When `fulfillment_event` gains a shop-facing read, this is where it lands.
 */
function OrderActivity({ detail }: { detail: FulfillmentDetail }) {
  const entries = [
    { title: "Order reached your shop", meta: formatTime(detail.placedAt) },
    { title: `Now ${STATUS_LABEL[detail.status].toLowerCase()}`, meta: formatTime(detail.stateChangedAt) },
  ];

  return (
    <Section title="Activity">
      <div className="pt-3.5">
        {entries.map((e, i) => (
          <div key={i} className="grid grid-cols-[14px_1fr] gap-3">
            <div className="flex flex-col items-center">
              <span aria-hidden="true" className="bg-muted-foreground mt-[5px] size-[7px] rounded-full" />
              {i < entries.length - 1 ? (
                <span aria-hidden="true" className="bg-border w-px flex-1" />
              ) : null}
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-3 pb-4">
              <div className="text-[13.5px] font-medium">{e.title}</div>
              <div className="text-muted-foreground text-xs whitespace-nowrap">{e.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
