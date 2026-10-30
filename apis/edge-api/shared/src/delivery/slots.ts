import { instantAtLocalTime, localDateParts } from "../lib/collection-deadline";
import type { Queryable } from "../lib/db";
import { melbourneDate, type CollectionRun } from "./schedule";

/** No date and no zone: Effy's working day. */
export interface Clock {
  hour: number;
  minute: number;
}

/** Wall-clock times in Melbourne, a cutoff, and a capacity (null = no limit, the default). */
export interface Slot {
  id: string;
  start: Clock;
  end: Clock;
  cutoff: Clock;
  capacity: number | null;
  /** The "Any time" window, selling a day with no time. A label: no rule reads it; only what is offered and told differs. */
  anyTime: boolean;
}

/** The one place a slot becomes an instant; the result is stored and every reader reads that. */
export function clockOn(clock: Clock, day: Date): Date {
  const { year, month, day: d } = localDateParts(day);
  return instantAtLocalTime(year, month, d, clock.hour, clock.minute);
}

/** For a yyyy-mm-dd Melbourne date. */
export function clockOnDate(clock: Clock, date: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return instantAtLocalTime(year, month, day, clock.hour, clock.minute);
}

export interface OpenSlot {
  id: string;
  /** yyyy-mm-dd, Melbourne. */
  date: string;
  start: Date;
  end: Date;
  /** The slot's own cutoff, or today the last collection that can still serve it, whichever is first. */
  cutoff: Date;
}

/** `uncollectable` is only ever said of today. */
export type SlotVerdict = "open" | "cutoff" | "full" | "uncollectable";

/**
 * The one window rule: open at `now` for `date` when its cutoff that day has not passed; today only, a
 * run can still be made (now ≤ run − prep buffer) and reaches the hub in time (run + turnaround ≤
 * start); and it has room on that day. The cutoff is reported before fullness, since "closed" stays
 * true. Pure; `booked` is `public.delivery_slot_load` for `date`.
 */
export function judgeWindow(
  now: Date,
  date: string,
  slot: Slot,
  booked: number,
  runs: readonly CollectionRun[],
  bufferMin: number,
  turnaroundMin: number,
): { verdict: Exclude<SlotVerdict, "open"> } | { verdict: "open"; slot: OpenSlot } {
  const start = clockOnDate(slot.start, date);
  const end = clockOnDate(slot.end, date);
  const cutoff = clockOnDate(slot.cutoff, date);

  if (now.getTime() > cutoff.getTime()) return { verdict: "cutoff" };

  let effectiveCutoff = cutoff;
  if (date === melbourneDate(now)) {
    // The latest run that can still be made and gets the goods out in time.
    let lastOrder: Date | null = null;
    for (const r of runs) {
      const run = clockOn(r, now);
      const orderBy = new Date(run.getTime() - bufferMin * 60_000);
      if (now.getTime() > orderBy.getTime()) continue;
      if (run.getTime() + turnaroundMin * 60_000 > start.getTime()) continue;
      if (!lastOrder || orderBy.getTime() > lastOrder.getTime()) lastOrder = orderBy;
    }
    if (!lastOrder) return { verdict: "uncollectable" };
    if (lastOrder.getTime() < cutoff.getTime()) effectiveCutoff = lastOrder;
  }
  if (slot.capacity !== null && booked >= slot.capacity) return { verdict: "full" };

  return { verdict: "open", slot: { id: slot.id, date, start, end, cutoff: effectiveCutoff } };
}

/** From the singleton settings row. */
export interface SlotSettings {
  holdMin: number;
  turnaroundMin: number;
  /** ISO: 1 = Monday … 7 = Sunday. */
  noWeekdays: number[];
  /** Effy delivery days offered after today. */
  effyLookaheadDays: number;
  /** What an asap customer is told to expect. */
  asapEstimate: string;
}

/** The words the column defaults to. */
export const ASAP_ESTIMATE_DEFAULT = "usually within 2–3 days";

/** The column defaults, used only before the settings row exists. */
const DEFAULT_SLOT_SETTINGS: SlotSettings = {
  holdMin: 10,
  turnaroundMin: 60,
  noWeekdays: [],
  effyLookaheadDays: 3,
  asapEstimate: ASAP_ESTIMATE_DEFAULT,
};

export async function loadSlotSettings(q: Queryable): Promise<SlotSettings> {
  const row = (
    await q.query<{
      slot_hold_min: number;
      sameday_hub_turnaround_min: number;
      standard_no_delivery_weekdays: number[] | null;
      effy_lookahead_days: number;
      asap_estimate: string;
    }>(`
		SELECT slot_hold_min, sameday_hub_turnaround_min,
		       standard_no_delivery_weekdays::int[] AS standard_no_delivery_weekdays,
		       effy_lookahead_days, asap_estimate
		FROM public.delivery_settings WHERE id = 1`)
  ).rows[0];
  if (!row) return { ...DEFAULT_SLOT_SETTINGS };
  return {
    holdMin: row.slot_hold_min,
    turnaroundMin: row.sameday_hub_turnaround_min,
    noWeekdays: row.standard_no_delivery_weekdays ?? [],
    effyLookaheadDays: row.effy_lookahead_days,
    asapEstimate: row.asap_estimate,
  };
}

const SLOT_COLUMNS = `id::text AS id,
		       EXTRACT(HOUR FROM start_time)::int AS start_hour,   EXTRACT(MINUTE FROM start_time)::int AS start_minute,
		       EXTRACT(HOUR FROM end_time)::int AS end_hour,       EXTRACT(MINUTE FROM end_time)::int AS end_minute,
		       EXTRACT(HOUR FROM cutoff_time)::int AS cutoff_hour, EXTRACT(MINUTE FROM cutoff_time)::int AS cutoff_minute,
		       capacity, any_time`;

interface SlotRow {
  id: string;
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  cutoff_hour: number;
  cutoff_minute: number;
  capacity: number | null;
  any_time: boolean;
}

const toSlot = (r: SlotRow): Slot => ({
  id: r.id,
  start: { hour: r.start_hour, minute: r.start_minute },
  end: { hour: r.end_hour, minute: r.end_minute },
  cutoff: { hour: r.cutoff_hour, minute: r.cutoff_minute },
  capacity: r.capacity,
  anyTime: r.any_time,
});

export async function loadSlots(q: Queryable): Promise<Slot[]> {
  const rows = await q.query<SlotRow>(`
		SELECT ${SLOT_COLUMNS}
		-- availability-exempt: public.delivery_slot - a delivery window's lifecycle.
		FROM public.delivery_slot WHERE status = 'active' ORDER BY start_time, end_time`);
  return rows.rows.map(toSlot);
}

/**
 * Reads one active slot and holds its row lock: the capacity guarantee, serialising two customers for
 * the last place. `tx` must be a transaction's client. null when missing or disabled.
 */
export async function lockSlot(tx: Queryable, slotId: string): Promise<Slot | null> {
  const row = (
    await tx.query<SlotRow>(
      `
		SELECT ${SLOT_COLUMNS}
		-- availability-exempt: public.delivery_slot - a delivery window's lifecycle.
		FROM public.delivery_slot WHERE id = $1 AND status = 'active'
		FOR UPDATE`,
      [slotId],
    )
  ).rows[0];
  return row ? toSlot(row) : null;
}

/** Places taken per slot on a Melbourne date, from `public.delivery_slot_load` only. */
export async function slotLoad(q: Queryable, date: string): Promise<Map<string, number>> {
  const rows = await q.query<{ slot_id: string; booked: number }>(
    `SELECT slot_id::text AS slot_id, booked::int AS booked FROM public.delivery_slot_load WHERE delivery_date = $1::date`,
    [date],
  );
  return new Map(rows.rows.map((r) => [r.slot_id, r.booked]));
}

/** For several dates in one round trip: date → slot → places taken. */
export async function slotLoadByDate(q: Queryable, dates: readonly string[]): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>(dates.map((d) => [d, new Map()]));
  if (dates.length === 0) return out;
  const rows = await q.query<{ slot_id: string; delivery_date: string; booked: number }>(
    `SELECT slot_id::text AS slot_id, delivery_date::text AS delivery_date, booked::int AS booked
		FROM public.delivery_slot_load WHERE delivery_date = ANY($1::date[])`,
    [dates],
  );
  for (const r of rows.rows) out.get(r.delivery_date)?.set(r.slot_id, r.booked);
  return out;
}

/** For several dates: date → slot → this customer's live holds. */
export async function ownLiveHoldsByDate(
  q: Queryable,
  customerId: string | null,
  dates: readonly string[],
): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (!customerId || dates.length === 0) return out;
  const rows = await q.query<{ slot_id: string; delivery_date: string; n: number }>(
    `
		SELECT b.slot_id::text AS slot_id, b.delivery_date::text AS delivery_date, count(*)::int AS n
		FROM public.delivery_slot_booking b
		JOIN public."order" o ON o.id = b.order_id
		WHERE o.customer_id = $1 AND o.status = 'pending_payment'
		  AND b.delivery_date = ANY($2::date[]) AND b.state = 'held' AND b.held_until > now()
		GROUP BY b.slot_id, b.delivery_date`,
    [customerId, dates],
  );
  for (const r of rows.rows) {
    if (!out.has(r.delivery_date)) out.set(r.delivery_date, new Map());
    out.get(r.delivery_date)!.set(r.slot_id, r.n);
  }
  return out;
}

/** From `from` (yyyy-mm-dd) onward. */
export async function nonDeliveryDates(q: Queryable, from: string): Promise<Set<string>> {
  const rows = await q.query<{ day: string }>(
    `SELECT day::text AS day FROM public.delivery_non_delivery_date WHERE day >= $1::date`,
    [from],
  );
  return new Set(rows.rows.map((r) => r.day));
}
