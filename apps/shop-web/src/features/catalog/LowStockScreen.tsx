import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type { LowStockRowDTO } from "@effy/shared-types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Restock</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything out of stock, and everything at or below its low-stock threshold. Products you
          do not track never appear here.
        </p>
      </div>

      <ShopDefaultThresholdControl />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <LowStockTable rows={data} />
      )}
    </div>
  );
}

function LowStockTable({ rows }: { rows: LowStockRowDTO[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing needs restocking right now.
      </p>
    );
  }

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
