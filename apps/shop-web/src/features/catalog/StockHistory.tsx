import type { StockMovementDTO } from "@effy/shared-types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui";

import { actorLabel, formatDelta, reasonLabel } from "./stockMovementText";

/**
 * The movement history (054 FR-009) — a TABLE, newest first. Not cards (Principle V).
 *
 * ⚠ IT SAYS WHO, AND WHETHER IT WAS BACK-OFFICE. FR-027 requires a shop to see plainly when someone
 * outside the shop changed their numbers on their behalf; that is why `actorKind` is a separate
 * column from `reason` rather than a reason value. A back-office correction that looked like the
 * shop's own would leave an operator unable to explain their own stock.
 */
export function StockHistory({ movements }: { movements: StockMovementDTO[] }) {
  // ⚠ NO HEADING OF ITS OWN (057). It used to carry an "History" h3 with its own hairline; the
  // Inventory section now supplies the "Stock movements" heading above it, and two headings for one
  // table is the kind of drift that reads as a rendering bug rather than a design.
  return (
    <section className="space-y-3">
      {movements.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No stock changes recorded yet. Every change to the count appears here, with who made it and
          why.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Count</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{formatWhen(m.createdAt)}</TableCell>
                  <TableCell className="tabular-nums">{formatDelta(m.quantityDelta)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {m.quantityBefore} → {m.quantityAfter}
                  </TableCell>
                  <TableCell>{reasonLabel(m)}</TableCell>
                  <TableCell>{actorLabel(m)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
