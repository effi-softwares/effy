import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Route, SearchX, Truck, UserX } from "lucide-react";

import { cn } from "@effy/design-system";
import { Button, Skeleton } from "@effy/design-system/ui";
import { ADMIN_ORDER_DELIVERY_FILTERS, ADMIN_ORDER_PROMISE_FILTERS, type DeliveryPromise } from "@effy/shared-types";
import { ErrorState, PackageStatusPill } from "@effy/web-kit/console";

import { Kbd } from "@/components/patterns/Kbd";
import { PageHeader, ViewTabs } from "@/components/patterns/Page";
import { EmptyState } from "@/components/patterns/States";
import { Facet, Pager, ResetFilters, SearchBox, Toolbar, ToolbarSpacer } from "@/components/patterns/Toolbar";
import { moment, money } from "@/lib/format";

import { AWAITING_LABEL, DELIVERY_FILTER_LABEL, deliveryTypeText, PROMISE_LABEL, STAGE_LABEL, type OrderListParams, type OrderSummary } from "./model";
import { orderViewCountsQuery, ordersListQuery } from "./queries";

/**
 * The order list (redesign, board "Orders — all orders").
 *
 * Saved views are tabs with counts and live in the URL, so a view's link opens the same list for
 * anyone. Search and two facets (who delivers, what an Effy order was sold) narrow every view. A
 * table on a desktop, two-line rows on a phone; J / K move through the rows and Enter opens one.
 *
 * ⚠ A TABLE, NOT CARDS, AND NO METRIC ROW (Principle V). The counts on the tabs take you to the rows
 * rather than telling you how many there are.
 */
export const ORDER_VIEWS = ["all", "driver", "handover", "arrival", "refund", "courier"] as const;
export type OrderView = (typeof ORDER_VIEWS)[number];
export interface OrdersSearch {
  view?: OrderView;
  delivery?: "effy" | "courier";
  sold?: DeliveryPromise;
}

const VIEW_LABEL: Record<OrderView, string> = {
  all: "All orders",
  driver: "Needs a driver",
  handover: AWAITING_LABEL.handover,
  arrival: AWAITING_LABEL.arrival,
  refund: AWAITING_LABEL.refund_decision,
  courier: AWAITING_LABEL.courier_problem,
};

function viewParams(view: OrderView): Pick<OrderListParams, "awaiting" | "needsDriver"> {
  switch (view) {
    case "driver":
      return { needsDriver: true };
    case "handover":
      return { awaiting: "handover" };
    case "arrival":
      return { awaiting: "arrival" };
    case "refund":
      return { awaiting: "refund_decision" };
    case "courier":
      return { awaiting: "courier_problem" };
    default:
      return {};
  }
}

export function OrdersListScreen() {
  const search = useSearch({ strict: false }) as OrdersSearch;
  const navigate = useNavigate();
  const view: OrderView = search.view ?? "all";
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(25);
  /**
   * Keyset paging, so a stack rather than a page number. ⚠ A cursor list cannot jump to "page 5" —
   * the trade for never showing the same order twice while new ones arrive. Changing a filter resets
   * it: a cursor minted under one filter means nothing under another.
   */
  const [cursors, setCursors] = useState<string[]>([]);
  const [focus, setFocus] = useState(-1);

  const setSearch = (patch: Partial<OrdersSearch>) => {
    setCursors([]);
    setFocus(-1);
    void navigate({ to: "/orders", search: (prev: OrdersSearch) => clean({ ...prev, ...patch }) });
  };

  const base = useMemo<OrderListParams>(
    () => ({
      q: q.trim() || undefined,
      deliveryType: search.sold ? undefined : search.delivery,
      promise: search.sold,
    }),
    [q, search.delivery, search.sold],
  );
  const params = useMemo<OrderListParams>(
    () => ({ ...base, ...viewParams(view), cursor: cursors[cursors.length - 1], limit: rows }),
    [base, view, cursors, rows],
  );

  const { data, error, isPending, isError, refetch } = useQuery(ordersListQuery(params));
  const counts = useQuery(orderViewCountsQuery(base));
  const items = data?.items ?? [];

  useEffect(() => setFocus(-1), [data]);
  useHotkey("J", () => setFocus((i) => Math.min(i + 1, items.length - 1)), { ignoreInputs: true });
  useHotkey("K", () => setFocus((i) => Math.max(i - 1, 0)), { ignoreInputs: true });
  useHotkey(
    "Enter",
    () => {
      const o = items[focus];
      if (o) void navigate({ to: "/orders/$orderId", params: { orderId: o.id } });
    },
    { ignoreInputs: true, enabled: focus >= 0 },
  );

  const c = counts.data;
  const countOf: Record<OrderView, number | undefined> = {
    all: c?.all,
    driver: c?.needsDriver,
    handover: c?.handover,
    arrival: c?.arrival,
    refund: c?.refundDecision,
    courier: c?.courierProblem,
  };
  const filtered = Boolean(q || search.delivery || search.sold);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every paid order, where it is, and who has it. A view is a saved filter — its link opens the same list for anyone."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/orders/assignments">
                <Route aria-hidden="true" />
                Dispatch
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/orders/handover">
                <Truck aria-hidden="true" />
                Courier parcels
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-3">
        <ViewTabs
          label="Order views"
          active={view}
          views={ORDER_VIEWS.map((v) => ({
            key: v,
            label: VIEW_LABEL[v],
            link: { to: "/orders", search: (prev: OrdersSearch) => clean({ ...prev, view: v === "all" ? undefined : v }) } as never,
            count: countOf[v],
            attention: v !== "all",
          }))}
        />
        <Toolbar>
          <SearchBox
            label="Search orders"
            placeholder="Order number or customer email…"
            value={q}
            onChange={(v) => {
              setQ(v);
              setCursors([]);
            }}
          />
          <Facet
            label="Delivery"
            value={search.delivery ?? null}
            onChange={(v) => setSearch({ delivery: v ?? undefined, sold: v === "effy" ? search.sold : undefined })}
            options={ADMIN_ORDER_DELIVERY_FILTERS.map((f) => ({ value: f, label: DELIVERY_FILTER_LABEL[f] }))}
          />
          <Facet
            label="Sold as"
            value={search.sold ?? null}
            onChange={(v) => setSearch({ sold: v ?? undefined, delivery: v ? "effy" : search.delivery })}
            options={ADMIN_ORDER_PROMISE_FILTERS.map((p) => ({ value: p, label: PROMISE_LABEL[p] }))}
          />
          {filtered ? (
            <ResetFilters
              onReset={() => {
                setQ("");
                setSearch({ delivery: undefined, sold: undefined });
              }}
            />
          ) : null}
          <ToolbarSpacer />
        </Toolbar>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="bo-table-wrap space-y-0 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="mb-3 h-10" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={filtered || view !== "all" ? "No orders match your filter." : "No orders yet."}
          description={filtered || view !== "all" ? "Try a different view, or clear the filters." : "Paid orders appear here as they arrive."}
          action={
            filtered || view !== "all" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQ("");
                  setSearch({ view: undefined, delivery: undefined, sold: undefined });
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="bo-table-wrap">
          <div className="bo-table-scroll">
            <table className="bo-table bo-rtable">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Placed</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Delivery</th>
                  <th>Driver</th>
                  <th>Next step</th>
                  <th className="is-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o, i) => (
                  <OrderRow key={o.id} order={o} focused={i === focus} />
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            summary={`${items.length} order${items.length === 1 ? "" : "s"} · page ${cursors.length + 1}`}
            canBack={cursors.length > 0}
            canNext={Boolean(data.nextCursor)}
            onBack={() => setCursors((s) => s.slice(0, -1))}
            onNext={() => setCursors((s) => (data.nextCursor ? [...s, data.nextCursor] : s))}
            rows={rows}
            onRows={(n) => {
              setRows(n);
              setCursors([]);
            }}
          />
        </div>
      )}

      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground max-md:hidden">
        <Kbd>J</Kbd>
        <Kbd>K</Kbd> move through rows · <Kbd>↵</Kbd> opens the order · Status is the order's least-advanced package; Problem
        always wins.
      </p>
    </>
  );
}

function clean(s: OrdersSearch): OrdersSearch {
  const out: OrdersSearch = {};
  if (s.view && s.view !== "all") out.view = s.view;
  if (s.delivery) out.delivery = s.delivery;
  if (s.sold) out.sold = s.sold;
  return out;
}

function OrderRow({ order: o, focused }: { order: OrderSummary; focused: boolean }) {
  return (
    <tr className={cn(focused && "is-selected")} aria-selected={focused || undefined}>
      <td data-m="primary">
        <Link to="/orders/$orderId" params={{ orderId: o.id }} className="bo-link bo-code">
          {o.orderNumber}
        </Link>
        <span className="bo-sub md:hidden">{o.customerEmail}</span>
      </td>
      <td data-m="hide" className="is-muted whitespace-nowrap">
        {moment(o.placedAt)}
      </td>
      <td data-m="hide">
        <span className="line-clamp-1">{o.customerEmail}</span>
      </td>
      <td data-m="badge">{o.statusView ? <PackageStatusPill view={o.statusView} showDetail={false} icons /> : "—"}</td>
      <td data-m="meta">
        {/* 079 — who delivers it; a dash for an order from before delivery types — nothing is guessed. */}
        <span className="whitespace-nowrap">{o.deliveryType ? deliveryTypeText(o.deliveryType) : "—"}</span>
        {o.promise && o.promise !== "window" ? <span className="bo-sub">{PROMISE_LABEL[o.promise]}</span> : null}
      </td>
      <td data-m="hide">
        <DriverCell order={o} />
      </td>
      <td data-m="meta" data-label="Next step">
        {o.awaiting ? <span className="font-medium">{AWAITING_LABEL[o.awaiting]}</span> : <span className="text-muted-foreground">Complete</span>}
        {/* ⚠ What the CUSTOMER is being told — staff always see the shopper's words. */}
        <span className="bo-sub">Customer sees: {STAGE_LABEL[o.stage] ?? o.stage}</span>
      </td>
      <td data-m="trail" className="is-num font-medium">
        {money(o.grandTotalAmount, o.currency)}
      </td>
    </tr>
  );
}

/** "Ada → Ben" (collect → deliver), and a tag when a package has nobody (073). */
function DriverCell({ order }: { order: OrderSummary }) {
  const { collect, deliver } = order.drivers;
  const names = [collect.join(", "), deliver.join(", ")].filter((s) => s !== "");
  return (
    <span className="flex flex-col items-start gap-1">
      {names.length > 0 ? <span className="whitespace-nowrap">{names.join(" → ")}</span> : !order.needsDriver ? <span className="text-muted-foreground">—</span> : null}
      {order.needsDriver ? (
        <span className="bo-tag">
          <UserX aria-hidden="true" />
          Needs a driver
        </span>
      ) : null}
    </span>
  );
}
