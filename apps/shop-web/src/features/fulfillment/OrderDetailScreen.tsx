import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft } from "lucide-react";

import { ErrorState } from "@effy/web-kit/console";

import { FulfillmentStatusBadge } from "./components/FulfillmentStatusBadge";
import { PickList } from "./components/PickList";
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
 */
export function OrderDetailScreen({ fulfillmentId }: { fulfillmentId: string }) {
  const { data, error, isPending, isError, refetch } = useQuery(
    fulfillmentDetailQuery(fulfillmentId),
  );

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
    <div className="space-y-6">
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
        <StateControl detail={detail} onReload={() => void refetch()} />
      </div>

      {shortfall > 0 ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/40"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
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

      <Section title={`Pick list (${detail.items.length} line${detail.items.length === 1 ? "" : "s"})`}>
        <PickList fulfillmentId={detail.id} items={detail.items} status={detail.status} />
      </Section>
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
    <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map(([label, value], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
