// What a driver does next — ONE definition, shared by every surface that shows a round (063).
//
// ⚠ WHY THIS IS SHARED RATHER THAN RETYPED. Two surfaces render a round's order: the dispatcher
// console and the driver app. If they disagree, a dispatcher reorders a round and the driver never
// sees the new order — and NOTHING FAILS, because both surfaces successfully render something. That
// is 029's banner target, 033's `available` flag and 052's `summarizeFulfillment`, where two
// implementations of one rule diverged silently because each half was correct in isolation.
//
// ⚠ THERE IS NO GEOMETRY HERE, AND THAT IS THE DESIGN (operator direction, D20). Sequencing is an
// ORDERING problem, not a routing one: no coordinate, no distance, no travel time, no solver. The
// sort key below replaces the cost function a router would have used. The trade is real and was
// accepted deliberately — a driver may zigzag WITHIN a zone, because nothing knows which of two
// addresses in one suburb is closer. At one metro with fewer than ten drivers that is cheap, and the
// dispatcher reorders when it matters.

/** The minimum a stop must expose to be ordered. Callers pass their own richer row. */
export interface OrderableStop {
  id: string;
  /** A dispatcher's manual position, or null when they have not set one. */
  seq: number | null;
  status: "pending" | "arrived" | "done" | "skipped";
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
  arrived: 1,
  done: 2,
  skipped: 3,
};

function time(v: Date | string | null): number {
  if (v === null) return Number.POSITIVE_INFINITY; // no deadline sorts after every deadline
  return (v instanceof Date ? v : new Date(v)).getTime();
}

/** Nulls sort last, then lexicographically — so the order never depends on row arrival order. */
function byNullableId(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * Order a round's stops so that what to do next is first (FR-017).
 *
 * The key, in precedence (FR-018):
 *   1. **status** — actionable before finished
 *   2. **time constraint** — the collection deadline or promised window
 *   3. **zone** — all stops in one area together
 *   4. **shop** — same-shop packages adjacent
 *
 * ⚠ A DISPATCHER'S `seq` BEATS ALL OF IT (FR-031), but only among stops that still have something to
 * do. A person reordering a round is asserting something about the world the sort key cannot know —
 * traffic, a shop that opens late, a customer who called. Letting the derived order win would discard
 * that. Completed stops keep the derived order regardless, so finishing a stop cannot reshuffle the
 * list under the driver's thumb.
 *
 * ⚠ TOTAL AND DETERMINISTIC. The final tie-break is the stop id, so the same set of stops always
 * yields the same order (FR-020, SC-007). An unstable sort here would make a dispatcher's "why did it
 * move?" unanswerable and the whole thing untestable.
 */
export function orderRoundStops<T extends OrderableStop>(stops: readonly T[]): T[] {
  return [...stops].sort((a, b) => {
    const sa = STATUS_RANK[a.status];
    const sb = STATUS_RANK[b.status];
    if (sa !== sb) return sa - sb;

    // A manual order applies only among stops still to be done, and only when BOTH carry one —
    // otherwise a single manually-placed stop would have nothing meaningful to compare against.
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
