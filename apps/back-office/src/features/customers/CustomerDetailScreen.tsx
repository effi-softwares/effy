import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Button } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";

import { canDebitPoints, creditIsLimited } from "./access";
import { CreditPointsSheet } from "./components/CreditPointsSheet";
import { DebitPointsSheet } from "./components/DebitPointsSheet";
import { PointsHistoryTable } from "./components/PointsHistoryTable";
import { formatDay, formatPoints } from "./components/points-format";
import { customerDetailQuery, pointsSettingsQuery } from "./queries";

const money = (amount: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", currencyDisplay: "narrowSymbol" }).format(Number(amount));

/**
 * One customer and their points (074 US1, US5).
 *
 * ⚠ A SECTIONED PAGE, NOT CARDS (Principle V). The balance is a line of detail rows, not a metric
 * tile: the one question here is "what do they have, and what happened to it", read top to bottom.
 */
export function CustomerDetailScreen({ customerId }: { customerId: string }) {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const detail = useQuery(customerDetailQuery(customerId));
  const settings = useQuery(pointsSettingsQuery);
  const [crediting, setCrediting] = useState(false);
  const [debiting, setDebiting] = useState(false);

  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  if (detail.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const c = detail.data;
  const centsPerPoint = settings.data?.centsPerPoint ?? 1;
  const limit = creditIsLimited(roles) ? (settings.data?.csaCreditLimitPoints ?? null) : null;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          <Link to="/customers" className="hover:underline">
            Customers
          </Link>
        </p>
        <h1 className="text-xl font-semibold">{c.name || c.email}</h1>
        <p className="text-muted-foreground">{c.email}</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-sm font-semibold">Points</h2>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setCrediting(true)}>
              Credit points
            </Button>
            {canDebitPoints(roles) ? (
              <Button size="sm" variant="outline" onClick={() => setDebiting(true)} disabled={c.points.usable === 0}>
                Remove points
              </Button>
            ) : null}
          </div>
        </div>
        <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Usable</dt>
          <dd className="tabular-nums">
            {formatPoints(c.points.usable)} · {money(c.points.valueAmount)}
          </dd>
          <dt className="text-muted-foreground">Held at checkout</dt>
          <dd className="tabular-nums">{c.points.held > 0 ? formatPoints(c.points.held) : "—"}</dd>
          <dt className="text-muted-foreground">Next to expire</dt>
          <dd className="tabular-nums">
            {c.points.nextExpiry ? `${formatPoints(c.points.nextExpiry.points)} after ${formatDay(c.points.nextExpiry.date)}` : "—"}
          </dd>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="border-b pb-2 text-sm font-semibold">History</h2>
        <PointsHistoryTable customerId={c.id} />
      </section>

      <section className="space-y-3">
        <h2 className="border-b pb-2 text-sm font-semibold">Recent orders</h2>
        {c.recentOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {c.recentOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2">
                <Link to="/orders/$orderId" params={{ orderId: o.id }} className="font-mono text-primary hover:underline">
                  {o.orderNumber}
                </Link>
                <span className="tabular-nums text-muted-foreground">{money(o.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreditPointsSheet
        open={crediting}
        onOpenChange={setCrediting}
        customerId={c.id}
        customerName={c.name || c.email}
        orders={c.recentOrders}
        limit={limit}
        centsPerPoint={centsPerPoint}
      />
      {canDebitPoints(roles) ? (
        <DebitPointsSheet
          open={debiting}
          onOpenChange={setDebiting}
          customerId={c.id}
          customerName={c.name || c.email}
          usable={c.points.usable}
          centsPerPoint={centsPerPoint}
        />
      ) : null}
    </div>
  );
}
