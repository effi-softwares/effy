import { useMemo, useState } from "react";

import { Badge } from "@effy/design-system/ui";
import { OrdersTabs } from "./OrdersTabs";
import { PackageStatusPill } from "@effy/web-kit/console";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { ADMIN_ORDER_DELIVERY_FILTERS, type AdminOrderDeliveryFilter } from "@effy/shared-types";

import { AWAITING_LABEL, DELIVERY_FILTER_LABEL, deliveryTypeText, STAGE_LABEL, type OrderSummary } from "./model";
import { ordersListQuery } from "./queries";

const ALL = "all";
const NEEDS_DRIVER = "needs_driver";

/**
 * The back-office order register (053 US1).
 *
 * ⚠ A TABLE, NOT CARDS, AND NO METRIC ROW AT THE TOP (Principle V). An order list is exactly where
 * the dashboard-summary instinct fires — "orders today", "awaiting handover", "delivered this week"
 * as four tiles. The constitution forbids it, and the filter below does the same job honestly: it
 * takes you to the rows rather than telling you how many there are.
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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(new Date(iso));
}

const columns: ColumnDef<OrderSummary>[] = [
  {
    accessorKey: "orderNumber",
    header: "Order",
    cell: ({ row }) => (
      <Link
        to="/orders/$orderId"
        params={{ orderId: row.original.id }}
        className="font-mono font-medium text-primary hover:underline"
      >
        {row.original.orderNumber}
      </Link>
    ),
  },
  { accessorKey: "customerEmail", header: "Customer" },
  {
    accessorKey: "placedAt",
    header: "Placed",
    cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.placedAt)}</span>,
  },
  {
    id: "status",
    header: "Status",
    // 073 — where the order really is, in the words every staff screen uses (its least advanced
    // package; a Problem anywhere wins).
    cell: ({ row }) =>
      row.original.statusView ? <PackageStatusPill view={row.original.statusView} showDetail={false} /> : "—",
  },
  {
    id: "delivery",
    header: "Delivery",
    // 079 — who delivers the order: Effy, or a courier. A dash for an order placed before orders
    // had a delivery type — nothing about an old order is guessed.
    cell: ({ row }) =>
      row.original.deliveryType ? deliveryTypeText(row.original.deliveryType) : <span className="text-muted-foreground">—</span>,
  },
  {
    id: "driver",
    header: "Driver",
    // 073 — who has it: "Ada → Ben" (collect → deliver), or "Needs a driver".
    cell: ({ row }) => <DriverCell order={row.original} />,
  },
  {
    accessorKey: "stage",
    header: "Customer sees",
    // ⚠ SERVER-DERIVED, and labelled as what the CUSTOMER sees rather than as an internal status.
    // An operator answering the phone needs the shopper's words, not the fulfilment machine's.
    cell: ({ row }) => STAGE_LABEL[row.original.stage] ?? row.original.stage,
  },
  {
    accessorKey: "awaiting",
    header: "Next step",
    cell: ({ row }) =>
      row.original.awaiting ? (
        <span className="font-medium">{AWAITING_LABEL[row.original.awaiting]}</span>
      ) : (
        <span className="text-muted-foreground">Complete</span>
      ),
  },
  {
    accessorKey: "grandTotalAmount",
    header: "Total",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatMoney(row.original.grandTotalAmount, row.original.currency)}
      </span>
    ),
  },
];

export function OrdersListScreen() {
  const [search, setSearch] = useState("");
  const [awaiting, setAwaiting] = useState<string>(ALL);
  // 083 — the go-live page links here with `?delivery=legacy&open=true`: the old orders still open.
  const fromUrl = useSearch({ strict: false }) as { delivery?: "legacy"; open?: boolean };
  const [delivery, setDelivery] = useState<string>(fromUrl.delivery === "legacy" ? "legacy" : ALL);
  const [stillOpen, setStillOpen] = useState<boolean>(fromUrl.delivery === "legacy" && fromUrl.open === true);
  /**
   * Keyset paging, so a stack rather than a page number.
   *
   * ⚠ A cursor list cannot jump to "page 5" — that is the trade for never showing an operator the
   * same order twice while new ones arrive. The stack is what makes Back possible; its length is the
   * only page number there is. Changing a filter resets it, because a cursor minted under one filter
   * means nothing under another.
   */
  const [cursors, setCursors] = useState<string[]>([]);

  const params = useMemo(
    () => ({
      q: search.trim() || undefined,
      awaiting: awaiting === ALL || awaiting === NEEDS_DRIVER ? undefined : (awaiting as "handover" | "arrival"),
      // 073 — orders with a package nobody is collecting or delivering.
      needsDriver: awaiting === NEEDS_DRIVER ? true : undefined,
      // 079 — who delivers the order.
      deliveryType: delivery === ALL ? undefined : (delivery as AdminOrderDeliveryFilter),
      stillOpen: delivery === "legacy" && stillOpen ? true : undefined,
      cursor: cursors[cursors.length - 1],
    }),
    [search, awaiting, delivery, stillOpen, cursors],
  );

  const { data, error, isPending, isError, refetch } = useQuery(ordersListQuery(params));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Orders</h1>
        <p className="text-muted-foreground">
          Every paid order, where it is, and who has it.
        </p>
      </div>
      <OrdersTabs />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by order reference or customer email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursors([]);
          }}
          className="max-w-sm"
        />
        <Select
          value={awaiting}
          onValueChange={(v) => {
            setAwaiting(v);
            setCursors([]);
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All orders</SelectItem>
            <SelectItem value={NEEDS_DRIVER}>Needs a driver</SelectItem>
            {/* The operator's work queue — derived from what is missing, never a stored state. */}
            <SelectItem value="handover">Needs handover</SelectItem>
            <SelectItem value="arrival">Awaiting arrival</SelectItem>
          </SelectContent>
        </Select>
        {/* 079 — who delivers the order. Its own control: it narrows the list, it is not a work queue. */}
        <Select
          value={delivery}
          onValueChange={(v) => {
            setDelivery(v);
            // "Still open" narrows the old orders only.
            if (v !== "legacy") setStillOpen(false);
            setCursors([]);
          }}
        >
          <SelectTrigger className="w-60" aria-label="Delivery type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any delivery</SelectItem>
            {ADMIN_ORDER_DELIVERY_FILTERS.map((f) => (
              <SelectItem key={f} value={f}>
                {DELIVERY_FILTER_LABEL[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {delivery === "legacy" && stillOpen ? (
          <Badge variant="secondary" className="gap-1" data-testid="still-open-chip">
            Still open
            <button
              type="button"
              aria-label="Show closed old orders too"
              className="rounded-full p-0.5 hover:bg-muted"
              onClick={() => {
                setStillOpen(false);
                setCursors([]);
              }}
            >
              <X className="size-3" aria-hidden />
            </button>
          </Badge>
        ) : null}
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data.items}
            emptyMessage="No orders match your filter."
          />
          {/* Rendered only when there is somewhere to go — no dead controls on a single page. */}
          {cursors.length > 0 || data.nextCursor ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {data.items.length} order{data.items.length === 1 ? "" : "s"}
                {cursors.length > 0 ? ` · page ${cursors.length + 1}` : ""}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={cursors.length === 0}
                  onClick={() => setCursors((c) => c.slice(0, -1))}
                >
                  Back
                </Button>
                <Button
                  variant="outline"
                  disabled={!data.nextCursor}
                  onClick={() =>
                    setCursors((c) => (data.nextCursor ? [...c, data.nextCursor] : c))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** "Ada → Ben", "Ada", or a warning word when a package has nobody (073). */
function DriverCell({ order }: { order: OrderSummary }) {
  const { collect, deliver } = order.drivers;
  const names = [collect.join(", "), deliver.join(", ")].filter((s) => s !== "");
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      {names.length > 0 ? <span>{names.join(" → ")}</span> : null}
      {order.needsDriver ? <Badge variant="warning">Needs a driver</Badge> : null}
      {names.length === 0 && !order.needsDriver ? <span className="text-muted-foreground">—</span> : null}
    </span>
  );
}

