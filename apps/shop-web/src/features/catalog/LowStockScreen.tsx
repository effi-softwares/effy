import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, Truck } from "lucide-react";

import type { LowStockRowDTO } from "@effy/shared-types";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PurchaseOrderBuilder } from "@/features/restock/PurchaseOrderBuilder";
import { PurchaseOrders } from "@/features/restock/PurchaseOrders";
import { SupplierSheet } from "@/features/restock/SupplierSheet";

import { lowStockQuery } from "./stockQueries";
import { ShopDefaultThresholdControl } from "./ShopDefaultThreshold";

/**
 * The restock list (054 US5, FR-029, SC-008).
 *
 * ⚠ THE POINT IS THAT RESTOCKING BECOMES A DECISION FROM A LIST, not from a customer complaint.
 * Before this, the only way a shop learned it had run out was a picker at an empty shelf — which
 * routes straight into the shortfall path that still has no money half (gap register G3).
 *
 * ⚠ A TABLE, not cards, and no metric cards at the top (Principle V / DOCTRINE-2). "Out of stock"
 * and "Low" are carried by WORDS AND WEIGHT, never a hue: 041 removed an amber warning colour from
 * this app's fulfilment and catalog screens, and a shop floor in bright light is the worst place to
 * depend on a tint.
 */
export function LowStockScreen() {
  const { data, error, isPending, isError, refetch } = useQuery(lowStockQuery);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);

  return (
    <div className="flex flex-col gap-[var(--pad)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Restock</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything out of stock, and everything at or below its low-stock threshold. Products you
            do not track never appear here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setSupplierOpen(true)}>
            <Truck />
            Add supplier
          </Button>
          <Button onClick={() => setOrderOpen(true)} disabled={(data ?? []).length === 0}>
            <Plus />
            New purchase order
          </Button>
        </div>
      </div>

      {/* 057: the shop-wide default is a distinct control zone, not prose floating above a table. */}
      <div className="rounded-md border p-4">
        <ShopDefaultThresholdControl />
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {/* ⚠ Counted from the rows, never a second stored figure (027's rule). Out-of-stock is
              named first and in semibold because it is the half that is already costing sales. */}
          {data.length > 0 ? (
            <p className="text-sm">
              <span className="font-semibold tabular-nums">
                {data.filter((r) => r.severity === "out").length}
              </span>{" "}
              out of stock ·{" "}
              <span className="tabular-nums">
                {data.filter((r) => r.severity !== "out").length}
              </span>{" "}
              running low
            </p>
          ) : null}
          <LowStockTable rows={data} />
        </>
      )}

      <PurchaseOrders />

      <SupplierSheet supplier={null} open={supplierOpen} onOpenChange={setSupplierOpen} />
      <PurchaseOrderBuilder rows={data ?? []} open={orderOpen} onOpenChange={setOrderOpen} />
    </div>
  );
}

/**
 * ⚠ GROUPED IN THE CLIENT, NOT IN THE QUERY (057 FR-018). The server keeps its urgency ordering
 * exactly as 054 shipped it — an out-of-stock product sorts above a merely-low one — and grouping a
 * list that is already urgency-ordered gives urgency ordering inside every group for free. The first
 * draft sorted by supplier in SQL instead, which silently demoted an empty shelf at one supplier below
 * a thin one at another; `low-stock.test.ts` caught it.
 *
 * ⚠ "Unassigned" IS A REAL GROUP, LISTED LAST. A product with no supplier is ordinary — most of them,
 * on the day this ships — and hiding those rows would make the restock list lie by omission.
 */
function groupBySupplier(rows: LowStockRowDTO[]): { name: string; rows: LowStockRowDTO[] }[] {
  const groups = new Map<string, { name: string; rows: LowStockRowDTO[] }>();
  for (const row of rows) {
    const key = row.supplierId ?? "\u0000unassigned";
    const name = row.supplierName ?? "Unassigned";
    const existing = groups.get(key);
    if (existing) existing.rows.push(row);
    else groups.set(key, { name, rows: [row] });
  }
  return [...groups.values()].sort((a, b) => {
    if (a.name === "Unassigned") return 1;
    if (b.name === "Unassigned") return -1;
    return a.name.localeCompare(b.name);
  });
}

function LowStockTable({ rows }: { rows: LowStockRowDTO[] }) {
  const groups = useMemo(() => groupBySupplier(rows), [rows]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing needs restocking right now.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.name} className="space-y-2">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-sm font-semibold">{group.name}</h2>
            <span className="text-muted-foreground text-xs tabular-nums">
              {group.rows.length} to restock
            </span>
          </div>
          <SupplierGroupTable rows={group.rows} />
        </section>
      ))}
    </div>
  );
}

function SupplierGroupTable({ rows }: { rows: LowStockRowDTO[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>In stock</TableHead>
            <TableHead>Threshold</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.productId}>
              <TableCell>
                {/* Straight to the product's Inventory tab — the list exists to be acted on. */}
                <Link
                  to="/catalog/$productId"
                  params={{ productId: row.productId }}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {row.name}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {row.sku ?? "—"}
              </TableCell>
              <TableCell className="tabular-nums">{row.onHand}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {row.effectiveThreshold ?? "—"}
              </TableCell>
              <TableCell className={row.severity === "out" ? "font-semibold" : undefined}>
                {row.severity === "out" ? "Out of stock" : "Low"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
