import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";

import { canRecordOrderProgress } from "./access";
import { orderActionError } from "./errorText";
import { PackageRows } from "./components/PackageRows";
import { STAGE_LABEL, type OrderDetail } from "./model";
import { orderDetailQuery, useRecordArrival, useRecordHandoff } from "./queries";

/**
 * The back-office order detail (053 US1).
 *
 * ⚠ A SECTIONED PAGE, NOT A GRID OF CARDS (Principle V). Every instinct here is toward a "Payment"
 * card, a "Delivery" card, a "Packages" card. The constitution forbids it and the reason shows on
 * this page in particular: an operator reads top to bottom answering one question — where is this
 * order and what do I do next — and tiles make that a scavenger hunt.
 *
 * ⚠ NO METRIC ROW AT THE TOP either. The header states the order and what the customer currently
 * sees, which is the one fact a support call opens with.
 */

function formatMoney(amount: string, currency: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${currency} ${amount}`;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency || "AUD",
    currencyDisplay: "narrowSymbol",
  }).format(n);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
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

export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canRecord = canRecordOrderProgress(roles);

  const { data, error, isPending, isError, refetch } = useQuery(orderDetailQuery(orderId));
  const handoff = useRecordHandoff(orderId);
  const arrival = useRecordArrival(orderId);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const order: OrderDetail = data;
  const busy = handoff.isPending || arrival.isPending;

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
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-mono text-xl font-semibold">{order.orderNumber}</h1>
        <p className="text-muted-foreground">
          {/* What the SHOPPER currently sees — the words a support call opens with. */}
          Customer sees: <span className="font-medium text-foreground">
            {STAGE_LABEL[order.stage] ?? order.stage}
          </span>
          {order.finished ? " · Complete" : null}
        </p>
      </header>

      {actionError ? (
        <p role="alert" className="text-sm font-medium text-[#e01010] dark:text-[#ff6b6b]">
          {actionError}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Customer</h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{order.customerEmail}</dd>
          {order.customerName ? (
            <>
              <dt className="text-muted-foreground">Name</dt>
              <dd>{order.customerName}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Placed</dt>
          <dd className="tabular-nums">{formatDateTime(order.placedAt)}</dd>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Packages</h2>
        <PackageRows
          packages={order.packages}
          canRecord={canRecord}
          busy={busy}
          onHandoff={onHandoff}
          onArrival={onArrival}
        />
        {!canRecord ? (
          <p className="text-sm text-muted-foreground">
            Recording a handover or an arrival needs a manager or administrator.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Items</h2>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Product</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Unit</th>
              <th className="py-2 text-right font-medium">Line</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {order.items.map((i) => (
              <tr key={i.orderItemId}>
                <td className="py-2">{i.productName}</td>
                <td className="py-2 text-right tabular-nums">{i.quantity}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatMoney(i.unitPriceAmount, order.currency)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatMoney(i.lineSubtotalAmount, order.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Payment</h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Items</dt>
          <dd className="tabular-nums">{formatMoney(order.itemSubtotalAmount, order.currency)}</dd>
          {Number(order.discountAmount) > 0 ? (
            <>
              <dt className="text-muted-foreground">
                Discount{order.promoCode ? ` (${order.promoCode})` : ""}
              </dt>
              <dd className="tabular-nums">−{formatMoney(order.discountAmount, order.currency)}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Delivery</dt>
          <dd className="tabular-nums">{formatMoney(order.deliveryFeeAmount, order.currency)}</dd>
          <dt className="font-medium text-foreground">Total</dt>
          <dd className="font-medium tabular-nums">
            {formatMoney(order.grandTotalAmount, order.currency)}
          </dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>{order.paymentStatus}</dd>
          {/* Absent on a pre-052 order, or where the capture failed. Omitted, never invented. */}
          {order.paymentMethod ? (
            <>
              <dt className="text-muted-foreground">Method</dt>
              <dd>
                {[order.paymentMethod.brand, order.paymentMethod.last4 ? `ending ${order.paymentMethod.last4}` : null]
                  .filter(Boolean)
                  .join(" ") || order.paymentMethod.type}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Delivering to</h2>
        <address className="text-sm not-italic leading-6">
          {addressLines(order.deliveryAddress).map((line) => (
            <div key={line}>{line}</div>
          ))}
        </address>
        {order.billingAddress ? (
          <>
            <h3 className="pt-2 text-sm font-medium">Billing</h3>
            <address className="text-sm not-italic leading-6">
              {addressLines(order.billingAddress).map((line) => (
                <div key={line}>{line}</div>
              ))}
            </address>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Billing: same as delivery.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">History</h2>
        {/*
          ⚠ Rows of WHEN / WHAT / WHO, not a timeline widget. An operator scans this top to bottom
          reconstructing what happened; a decorated vertical rail costs width and adds nothing.
        */}
        <table className="w-full text-sm">
          <tbody className="divide-y">
            {order.history.map((h, i) => (
              <tr key={`${h.at}-${i}`}>
                <td className="w-48 py-2 align-top tabular-nums text-muted-foreground">
                  {formatDateTime(h.at)}
                </td>
                <td className="py-2 align-top">{h.summary}</td>
                <td className="w-56 py-2 align-top text-muted-foreground">
                  {h.actorSub ? <span className="font-mono text-xs">{h.actorSub}</span> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {order.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has happened to this order yet.</p>
        ) : null}
      </section>
    </div>
  );
}
