import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleMinus, CirclePlus, Coins, History, Mail, ShoppingBag } from "lucide-react";

import { Button, Skeleton, Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@effy/web-kit/patterns";
import { Panel } from "@effy/web-kit/patterns";
import { initialsOf } from "@/components/shell/identity";
import { useHeaderDetail } from "@/components/shell/SiteHeader";
import { sessionQuery } from "@/features/auth/queries";
import { money } from "@/lib/format";

import { canDebitPoints, creditIsLimited } from "./access";
import { CreditPointsSheet } from "./components/CreditPointsSheet";
import { DebitPointsSheet } from "./components/DebitPointsSheet";
import { PointsHistoryTable } from "./components/PointsHistoryTable";
import { formatDay, formatPoints } from "./components/points-format";
import { customerDetailQuery, pointsSettingsQuery } from "./queries";

/**
 * A customer (074; redesign, board "Customer — points and orders"): their points — usable, held,
 * next to expire — the ledger behind them, and recent orders. Points are a way of paying, never a
 * discount; the balance is worked out from the ledger, never stored.
 */
export function CustomerDetailScreen({ customerId }: { customerId: string }) {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const detail = useQuery(customerDetailQuery(customerId));
  const settings = useQuery(pointsSettingsQuery);
  const [crediting, setCrediting] = useState(false);
  const [debiting, setDebiting] = useState(false);
  useHeaderDetail(detail.data ? detail.data.name || detail.data.email : null);

  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  if (detail.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const c = detail.data;
  const centsPerPoint = settings.data?.centsPerPoint ?? 1;
  const limit = creditIsLimited(roles) ? (settings.data?.csaCreditLimitPoints ?? null) : null;
  const mayDebit = canDebitPoints(roles);

  return (
    <>
      <PageHeader
        back={{ label: "Customers", link: { to: "/customers" } }}
        title={c.name || c.email}
        meta={
          <>
            <span>
              <Mail aria-hidden="true" />
              {c.email}
            </span>
            <span>
              <ShoppingBag aria-hidden="true" />
              {c.recentOrders.length} recent {c.recentOrders.length === 1 ? "order" : "orders"}
            </span>
          </>
        }
        actions={
          <>
            {mayDebit ? (
              <Button variant="outline" onClick={() => setDebiting(true)} disabled={c.points.usable === 0}>
                <CircleMinus aria-hidden="true" />
                Remove points
              </Button>
            ) : null}
            <Button onClick={() => setCrediting(true)}>
              <CirclePlus aria-hidden="true" />
              Credit points
            </Button>
          </>
        }
      />

      <div className="bo-detail">
        <div className="bo-detail__main">
          <Panel title="Points" icon={<Coins aria-hidden="true" />} description="Points are a way of paying, never a discount. The balance is worked out from the ledger, never stored.">
            <dl className="bo-dl">
              <div className="bo-dl__row">
                <dt>Usable</dt>
                <dd>
                  <span className="text-xl font-semibold tabular-nums">{formatPoints(c.points.usable)}</span>{" "}
                  <span className="text-muted-foreground">· {money(c.points.valueAmount)}</span>
                </dd>
              </div>
              <div className="bo-dl__row">
                <dt>Held at checkout</dt>
                <dd className="tabular-nums">{c.points.held > 0 ? formatPoints(c.points.held) : "—"}</dd>
              </div>
              <div className="bo-dl__row">
                <dt>Next to expire</dt>
                <dd className="tabular-nums">
                  {c.points.nextExpiry ? `${formatPoints(c.points.nextExpiry.points)} after ${formatDay(c.points.nextExpiry.date)}` : "—"}
                </dd>
              </div>
            </dl>
          </Panel>

          <Tabs defaultValue="history">
            <div className="bo-tabsbar">
              <div className="bo-tabsbar__list">
                <TabsList aria-label="Customer sections">
                  <TabsTrigger value="history">
                    <History aria-hidden="true" />
                    History
                  </TabsTrigger>
                  <TabsTrigger value="orders">
                    <ShoppingBag aria-hidden="true" />
                    Recent orders
                    <TabsCount>{c.recentOrders.length}</TabsCount>
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
            <TabsContent value="history" className="bo-tabpanel">
              <Panel title="History" icon={<History aria-hidden="true" />} description="Newest first. Nothing is edited or deleted — a correction is a new line.">
                <PointsHistoryTable customerId={c.id} />
              </Panel>
            </TabsContent>
            <TabsContent value="orders" className="bo-tabpanel">
              <Panel title="Recent orders" icon={<ShoppingBag aria-hidden="true" />} flush>
                {c.recentOrders.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted-foreground">No orders yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {c.recentOrders.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <Link to="/orders/$orderId" params={{ orderId: o.id }} className="bo-link bo-code">
                          {o.orderNumber}
                        </Link>
                        <span className="text-sm tabular-nums">{money(o.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="bo-detail__aside is-first">
          <Panel title="Customer">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="bo-avatar bo-avatar--lg bo-avatar--blue" aria-hidden="true">
                  {initialsOf(c.name || c.email)}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{c.name || c.email}</div>
                  <div className="bo-sub truncate">{c.email}</div>
                </div>
              </div>
              <div className="grid gap-2">
                <Button onClick={() => setCrediting(true)}>
                  <CirclePlus aria-hidden="true" />
                  Credit points
                </Button>
                {mayDebit ? (
                  <Button variant="outline" onClick={() => setDebiting(true)} disabled={c.points.usable === 0}>
                    <CircleMinus aria-hidden="true" />
                    Remove points
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {limit !== null ? `You can credit up to ${formatPoints(limit)} points at once. ` : ""}
                Removing points needs a manager or an administrator.
              </p>
            </div>
          </Panel>
        </aside>
      </div>

      <CreditPointsSheet
        open={crediting}
        onOpenChange={setCrediting}
        customerId={c.id}
        customerName={c.name || c.email}
        orders={c.recentOrders}
        limit={limit}
        centsPerPoint={centsPerPoint}
      />
      {mayDebit ? (
        <DebitPointsSheet
          open={debiting}
          onOpenChange={setDebiting}
          customerId={c.id}
          customerName={c.name || c.email}
          usable={c.points.usable}
          centsPerPoint={centsPerPoint}
        />
      ) : null}
    </>
  );
}
