import { useEffect, useState } from "react";
import { isShopManager } from "@effy/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Undo2 } from "lucide-react";

import { Button } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";

import { FulfillmentStatusBadge } from "./components/FulfillmentStatusBadge";
import { PickList } from "./components/PickList";
import { RefundSheet } from "./components/RefundSheet";
import { StateControl } from "./components/StateControl";
import { track } from "@/lib/telemetry";

import { formatTime, type FulfillmentDetail } from "./model";
import { fulfillmentDetailQuery } from "./queries";

/**
 * The pick screen (US2/US3) — a sectioned page of `<dl>` detail rows plus the pick list, NEVER cards
 * (Principle V / DOCTRINE-2), following the `ProductDetailScreen` precedent.
 *
 * What this screen deliberately does NOT contain, and cannot: any payment field, any order-level
 * total, and any other shop's lines. The backend's projection simply does not select them
 * (FR-007/FR-008, SC-007), so the omission is structural rather than a rendering choice.
 *
 * Opening this screen IS the acknowledgement — a `pending` portion becomes `received` as a side
 * effect of the read (FR-011a), which is why there is no "acknowledge" button anywhere.
 *
 * ⚠ 057 RESTYLED THIS SCREEN AND DELIBERATELY ADDED NOTHING TO IT. The imported mockup's order detail
 * carries payment capture, carrier selection, shipment/tracking rows, line editing and a returns
 * panel. Effy can honour none of them — see `__tests__/order-detail.test.tsx`, which reads this
 * directory's source and fails naming the file if any of them appears. The layout changed; the
 * capability surface did not.
 */
export function OrderDetailScreen({ fulfillmentId }: { fulfillmentId: string }) {
  const { data, error, isPending, isError, refetch } = useQuery(
    fulfillmentDetailQuery(fulfillmentId),
  );

  const { data: session } = useQuery(sessionQuery);
  const [refundOpen, setRefundOpen] = useState(false);

  // ⚠ 057 US5 / FR-014b — A COURTESY, NOT THE GATE. The backend decides from the platform record
  // (role AND status AND the shop's own portion of THIS order) and refuses regardless of what this
  // renders. Withholding the control from a `shop_staff` operator only spares them a refusal they can
  // do nothing about — 020's FR-019a deliberately gave both roles full fulfilment access, and this is
  // the one action that is not fulfilment: a refund is irreversible and spends the business's money.
  const canRefund =
    session?.status === "signed-in" && isShopManager(session.identity.roles);

  // Keyed on the portion id, not on `data` — this is "the operator opened this order", which must
  // fire once per open, not again on every refetch or state change.
  const openedStatus = data?.status;
  useEffect(() => {
    if (!openedStatus) return;
    track({ name: "shop_order_opened", fulfillmentId, status: openedStatus });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per portion, not per status change
  }, [fulfillmentId]);

  if (isError) {
    return (
      <div className="space-y-4">
        <BackLink />
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
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const detail: FulfillmentDetail = data;
  const shortfall = detail.items.reduce((n, i) => n + i.unavailableQuantity, 0);

  return (
    <div className="flex flex-col gap-[var(--pad)]">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{detail.orderNumber}</h1>
            <FulfillmentStatusBadge status={detail.status} />
          </div>
          <p className="text-muted-foreground">
            Arrived {formatTime(detail.placedAt)} · ready by {formatTime(detail.promise.readyBy)} (
            {detail.promise.serviceLevel})
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StateControl detail={detail} onReload={() => void refetch()} />
          {/* ⚠ Separated from the forward actions and never a primary button. A mis-tap here returns a
              customer's money, which is not a wrong pixel. */}
          {canRefund ? (
            <Button variant="ghost" size="sm" onClick={() => setRefundOpen(true)}>
              <Undo2 />
              Refund items
            </Button>
          ) : null}
        </div>
      </div>

      {shortfall > 0 ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-muted px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
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

      {/* ⚠ The pick list gets the wide column and comes FIRST in the DOM. It is the only thing on
          this screen a person is actively working through, so it must be what a tablet shows without
          scrolling and what a screen reader reaches first. Delivery is reference material. */}
      <div className="grid gap-[var(--pad)] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Section
          title={`Pick list (${detail.items.length} line${detail.items.length === 1 ? "" : "s"})`}
        >
          <PickList fulfillmentId={detail.id} items={detail.items} status={detail.status} />
        </Section>

        <Section title="Delivery">
          <DetailList
            rows={[
              ["Recipient", detail.delivery.recipientName],
              ["Phone", detail.delivery.phone ?? "—"],
              ["Address", addressLine(detail)],
              ["City", detail.delivery.city],
              ["Region", detail.delivery.region ?? "—"],
              ["Postcode", detail.delivery.postalCode],
              ["Country", detail.delivery.country],
            ]}
          />
        </Section>
      </div>

      {canRefund ? (
        <RefundSheet detail={detail} open={refundOpen} onOpenChange={setRefundOpen} />
      ) : null}
    </div>
  );
}

function addressLine(detail: FulfillmentDetail): string {
  const { line1, line2 } = detail.delivery;
  return line2 ? `${line1}, ${line2}` : line1;
}

// ── Layout helpers (no cards — sectioned dl rows, per ProductDetailScreen) ────────────────────────

function BackLink() {
  return (
    <Link
      to="/orders"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Back to orders
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="border-b pb-2">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DetailList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map(([label, value], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
