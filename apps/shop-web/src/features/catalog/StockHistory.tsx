import type { StockActorKind, StockMovementDTO, StockMovementReason } from "@effy/shared-types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui";

/**
 * The movement history (054 FR-009) — a TABLE, newest first. Not cards (Principle V).
 *
 * ⚠ IT SAYS WHO, AND WHETHER IT WAS BACK-OFFICE. FR-027 requires a shop to see plainly when someone
 * outside the shop changed their numbers on their behalf; that is why `actorKind` is a separate
 * column from `reason` rather than a reason value. A back-office correction that looked like the
 * shop's own would leave an operator unable to explain their own stock.
 */
export function StockHistory({ movements }: { movements: StockMovementDTO[] }) {
  return (
    <section className="space-y-3">
      <div className="border-b pb-2">
        <h3 className="text-sm font-semibold">History</h3>
      </div>

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

/** A signed number, so an increase and a reduction are told apart at a glance without colour. */
function formatDelta(delta: number): string {
  if (delta === 0) return "0";
  return delta > 0 ? `+${delta}` : String(delta);
}

const REASONS: Record<StockMovementReason, string> = {
  received: "Stock received",
  correction: "Correction",
  damage: "Damaged",
  expiry: "Expired",
  order_paid: "Sold",
  pick_shortfall: "Short at picking",
  tracking_enabled: "Tracking turned on",
  tracking_disabled: "Tracking turned off",
};

function reasonLabel(m: StockMovementDTO): string {
  return REASONS[m.reason] ?? m.reason;
}

const ACTORS: Record<StockActorKind, string> = {
  shop: "",
  back_office: "Effy support",
  system: "Automatic",
};

function actorLabel(m: StockMovementDTO): string {
  if (m.actorKind === "system") {
    // A sale names the order it came from, which is the only way a shop can reconcile a drop it did
    // not make itself.
    return m.orderNumber ? `Order ${m.orderNumber}` : ACTORS.system;
  }
  if (m.actorKind === "back_office") {
    return m.actorLabel ? `${m.actorLabel} (Effy support)` : ACTORS.back_office;
  }
  return m.actorLabel ?? "—";
}
