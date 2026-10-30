// What a driver does next: one definition shared by the dispatcher console and the driver app, so a
// reorder is seen by both. Sequencing is ordering, not routing: no coordinates or travel time. A driver
// may zigzag within a zone; the dispatcher reorders when it matters.

/** The minimum a stop must expose to be ordered. Callers pass their own richer row. */
export interface OrderableStop {
  id: string;
  /** A dispatcher's manual position, or null when they have not set one. */
  seq: number | null;
  status: "pending" | "out_for_delivery" | "en_route" | "arrived" | "done" | "skipped";
  /** The deadline or promised time that applies to this stop, if any. */
  dueAt: Date | string | null;
  /** Groups stops in one area together. Null for the hub, which is in no zone. */
  zoneId: string | null;
  /** Keeps a shop's packages adjacent. Null for a customer drop. */
  shopId: string | null;
}

/** What is actionable now sorts above what is finished with. */
const STATUS_RANK: Record<OrderableStop["status"], number> = {
  pending: 0,
  // In-transit states rank with `arrived`: started, not finished.
  out_for_delivery: 1,
  en_route: 1,
  arrived: 1,
  done: 2,
  skipped: 3,
};

function time(v: Date | string | null): number {
  if (v === null) return Number.POSITIVE_INFINITY; // no deadline sorts after every deadline
  return (v instanceof Date ? v : new Date(v)).getTime();
}

/** Nulls sort last, then lexicographically - so the order never depends on row arrival order. */
function byNullableId(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * Orders a round's stops so what to do next is first, by status, then time constraint, then zone, then
 * shop. A dispatcher's `seq` beats all of it among stops still to do; completed stops keep the derived
 * order so finishing one cannot reshuffle the list. The final tie-break is the stop id, so the order is
 * total and deterministic.
 */
export function orderRoundStops<T extends OrderableStop>(stops: readonly T[]): T[] {
  return [...stops].sort((a, b) => {
    const sa = STATUS_RANK[a.status];
    const sb = STATUS_RANK[b.status];
    if (sa !== sb) return sa - sb;

    // Only when both carry a manual position; otherwise there is nothing to compare against.
    const actionable = sa <= STATUS_RANK.arrived;
    if (actionable && a.seq !== null && b.seq !== null && a.seq !== b.seq) {
      return a.seq - b.seq;
    }

    const ta = time(a.dueAt);
    const tb = time(b.dueAt);
    if (ta !== tb) return ta - tb;

    const z = byNullableId(a.zoneId, b.zoneId);
    if (z !== 0) return z;

    const sh = byNullableId(a.shopId, b.shopId);
    if (sh !== 0) return sh;

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
