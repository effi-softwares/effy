import { instantAtLocalTime, localDateParts } from "../lib/collection-deadline";
import type { Queryable } from "../lib/db";
import { melbourneDate, type CollectionRun } from "./sameday";

/** A wall-clock time of day. It names no date and no zone — it describes Effy's working day. */
export interface Clock {
  hour: number;
  minute: number;
}

/**
 * A same-day delivery window as back-office defined it (069): wall-clock times in
 * Australia/Melbourne, a cutoff after which it cannot be chosen, and how many deliveries it takes.
 *
 * ⚠ `capacity: null` IS NO LIMIT, and it is the default: a slot fills only where the back-office
 * set a number.
 */
export interface Slot {
  id: string;
  start: Clock;
  end: Clock;
  cutoff: Clock;
  capacity: number | null;
}

/**
 * Place a clock on the Melbourne calendar day that `day` falls on.
 *
 * ⚠ THIS IS THE ONE PLACE A SLOT BECOMES AN INSTANT. The result is stored (the booking, the
 * package) and every later reader — the planner, the driver app, the receipt — reads that stored
 * instant. 058 found two calendar defects that only DST tests caught, both from rebuilding an
 * instant out of wall-clock fields in more than one place.
 */
export function clockOn(clock: Clock, day: Date): Date {
  const { year, month, day: d } = localDateParts(day);
  return instantAtLocalTime(year, month, d, clock.hour, clock.minute);
}

/** The same, for a Melbourne date written yyyy-mm-dd (078 — a window on a later day). */
export function clockOnDate(clock: Clock, date: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return instantAtLocalTime(year, month, day, clock.hour, clock.minute);
}

/** A slot a customer may choose right now, as instants. */
export interface OpenSlot {
  id: string;
  /** yyyy-mm-dd, Melbourne. */
  date: string;
  start: Date;
  end: Date;
  /**
   * The EFFECTIVE last moment: the slot's own cutoff, or — today — the last collection that can
   * still serve it, whichever comes first.
   */
  cutoff: Date;
}

/** Why a slot is not open — or that it is. `uncollectable` is only ever said of TODAY. */
export type SlotVerdict = "open" | "cutoff" | "full" | "uncollectable";

/**
 * Decide whether one slot can be chosen at `now` for delivery on `date` (069 research R5, 078 R3).
 * It is open when:
 *
 *  1. its cutoff ON THAT DAY has not passed;
 *  2. — TODAY ONLY — a collection run is still makeable (now ≤ run − prep buffer, the 047 rule) AND
 *     that run reaches the hub in time to go out for it (run + turnaround ≤ slot start). A window on
 *     a later day can always be collected for; planning that collection is the driver side's job;
 *  3. it has capacity left on that day — always true for a slot with no limit.
 *
 * ⚠ THIS IS THE ONE WINDOW RULE. The quote, the hold at the payment-intent call and the 069
 * same-day path (`judgeSlot`) all call it; a second copy would let checkout offer what the hold
 * then refuses.
 *
 * ⚠ ORDER MATTERS FOR THE REASON, NOT THE RESULT: a slot that is both full and past cutoff reports
 * the cutoff, because "it has closed" stays true and "it is full" might not.
 *
 * Pure: no clock, no database. `booked` is what `public.delivery_slot_load` says for `date`.
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
    // The latest collection run that can still be made AND still gets the goods out in time.
    let lastOrder: Date | null = null;
    for (const r of runs) {
      const run = clockOn(r, now);
      const orderBy = new Date(run.getTime() - bufferMin * 60_000);
      if (now.getTime() > orderBy.getTime()) continue; // this run can no longer be made
      if (run.getTime() + turnaroundMin * 60_000 > start.getTime()) continue; // reaches the hub too late
      if (!lastOrder || orderBy.getTime() > lastOrder.getTime()) lastOrder = orderBy;
    }
    if (!lastOrder) return { verdict: "uncollectable" };
    if (lastOrder.getTime() < cutoff.getTime()) effectiveCutoff = lastOrder;
  }
  if (slot.capacity !== null && booked >= slot.capacity) return { verdict: "full" };

  return { verdict: "open", slot: { id: slot.id, date, start, end, cutoff: effectiveCutoff } };
}

/** `judgeWindow` for TODAY — the 069 same-day question. */
export function judgeSlot(
  now: Date,
  slot: Slot,
  booked: number,
  runs: readonly CollectionRun[],
  bufferMin: number,
  turnaroundMin: number,
): { verdict: Exclude<SlotVerdict, "open"> } | { verdict: "open"; slot: OpenSlot } {
  return judgeWindow(now, melbourneDate(now), slot, booked, runs, bufferMin, turnaroundMin);
}

/** Every slot that can be chosen at `now`, earliest first. */
export function openSlots(
  now: Date,
  slots: readonly Slot[],
  booked: ReadonlyMap<string, number>,
  runs: readonly CollectionRun[],
  bufferMin: number,
  turnaroundMin: number,
): OpenSlot[] {
  const out: OpenSlot[] = [];
  for (const s of slots) {
    const j = judgeSlot(now, s, booked.get(s.id) ?? 0, runs, bufferMin, turnaroundMin);
    if (j.verdict === "open") out.push(j.slot);
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
}

// ── Settings ─────────────────────────────────────────────────────────────────────────────────────

/** The 069 timings read from the singleton settings row. */
export interface SlotSettings {
  holdMin: number;
  turnaroundMin: number;
  lookaheadDays: number;
  /** ISO: 1 = Monday … 7 = Sunday. */
  noWeekdays: number[];
  carrierLeadDays: number;
  /** 078 — Effy delivery days offered after today, once the new delivery model is on. */
  effyLookaheadDays: number;
}

/**
 * The column defaults of the 069 migration. Used only when the settings row does not exist yet — a
 * zone and a plan can exist before a hub is configured.
 */
const DEFAULT_SLOT_SETTINGS: SlotSettings = {
  holdMin: 10,
  turnaroundMin: 60,
  lookaheadDays: 7,
  noWeekdays: [],
  carrierLeadDays: 1,
  effyLookaheadDays: 3,
};

export async function loadSlotSettings(q: Queryable): Promise<SlotSettings> {
  const row = (
    await q.query<{
      slot_hold_min: number;
      sameday_hub_turnaround_min: number;
      standard_lookahead_days: number;
      standard_no_delivery_weekdays: number[] | null;
      carrier_lead_days: number;
      effy_lookahead_days: number;
    }>(`
		SELECT slot_hold_min, sameday_hub_turnaround_min, standard_lookahead_days,
		       standard_no_delivery_weekdays::int[] AS standard_no_delivery_weekdays, carrier_lead_days,
		       effy_lookahead_days
		FROM public.delivery_settings WHERE id = 1`)
  ).rows[0];
  if (!row) return { ...DEFAULT_SLOT_SETTINGS };
  return {
    holdMin: row.slot_hold_min,
    turnaroundMin: row.sameday_hub_turnaround_min,
    lookaheadDays: row.standard_lookahead_days,
    noWeekdays: row.standard_no_delivery_weekdays ?? [],
    carrierLeadDays: row.carrier_lead_days,
    effyLookaheadDays: row.effy_lookahead_days,
  };
}

// ── Slots and their load ─────────────────────────────────────────────────────────────────────────

const SLOT_COLUMNS = `id::text AS id,
		       EXTRACT(HOUR FROM start_time)::int AS start_hour,   EXTRACT(MINUTE FROM start_time)::int AS start_minute,
		       EXTRACT(HOUR FROM end_time)::int AS end_hour,       EXTRACT(MINUTE FROM end_time)::int AS end_minute,
		       EXTRACT(HOUR FROM cutoff_time)::int AS cutoff_hour, EXTRACT(MINUTE FROM cutoff_time)::int AS cutoff_minute,
		       capacity`;

interface SlotRow {
  id: string;
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  cutoff_hour: number;
  cutoff_minute: number;
  capacity: number | null;
}

const toSlot = (r: SlotRow): Slot => ({
  id: r.id,
  start: { hour: r.start_hour, minute: r.start_minute },
  end: { hour: r.end_hour, minute: r.end_minute },
  cutoff: { hour: r.cutoff_hour, minute: r.cutoff_minute },
  capacity: r.capacity,
});

/** The active slots. */
export async function loadSlots(q: Queryable): Promise<Slot[]> {
  const rows = await q.query<SlotRow>(`
		SELECT ${SLOT_COLUMNS}
		-- availability-exempt: public.delivery_slot — a delivery window's lifecycle.
		FROM public.delivery_slot WHERE status = 'active' ORDER BY start_time, end_time`);
  return rows.rows.map(toSlot);
}

/**
 * Read one ACTIVE slot and take its row lock for the rest of the transaction. `null` when the slot
 * does not exist or is disabled.
 *
 * ⚠ THE LOCK IS THE CAPACITY GUARANTEE (069 research R4). "At most N" cannot be a unique index, so
 * two customers taking the last place are serialised here: the second waits, then counts the
 * first's hold. Remove `FOR UPDATE` and both read "one place left" and both take it. `tx` MUST be
 * a transaction's client — against the pool the lock is released the moment the statement ends.
 */
export async function lockSlot(tx: Queryable, slotId: string): Promise<Slot | null> {
  const row = (
    await tx.query<SlotRow>(
      `
		SELECT ${SLOT_COLUMNS}
		-- availability-exempt: public.delivery_slot — a delivery window's lifecycle.
		FROM public.delivery_slot WHERE id = $1 AND status = 'active'
		FOR UPDATE`,
      [slotId],
    )
  ).rows[0];
  return row ? toSlot(row) : null;
}

/**
 * How many places are taken in each slot on a Melbourne date.
 *
 * ⚠ It reads `public.delivery_slot_load` and nothing else. That view is the ONE definition of "a
 * booking counts" (confirmed, or held and not lapsed); the back-office console reads the same view.
 */
export async function slotLoad(q: Queryable, date: string): Promise<Map<string, number>> {
  const rows = await q.query<{ slot_id: string; booked: number }>(
    `SELECT slot_id::text AS slot_id, booked::int AS booked FROM public.delivery_slot_load WHERE delivery_date = $1::date`,
    [date],
  );
  return new Map(rows.rows.map((r) => [r.slot_id, r.booked]));
}

/**
 * The same, for several dates at once (078): date → slot → places taken. One round trip, and still
 * the one view.
 */
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

/** `ownLiveHolds` for several dates at once (078): date → slot → this customer's live holds. */
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

/**
 * The places this customer's OWN unpaid checkout is holding on a date.
 *
 * A quote subtracts these: without it a customer who reached the payment step in a capacity-1 slot
 * and went back would be told the slot they are holding is full — by their own hold.
 */
export async function ownLiveHolds(
  q: Queryable,
  customerId: string | null,
  date: string,
): Promise<Map<string, number>> {
  if (!customerId) return new Map();
  const rows = await q.query<{ slot_id: string; n: number }>(
    `
		SELECT b.slot_id::text AS slot_id, count(*)::int AS n
		FROM public.delivery_slot_booking b
		JOIN public."order" o ON o.id = b.order_id
		WHERE o.customer_id = $1 AND o.status = 'pending_payment'
		  AND b.delivery_date = $2::date AND b.state = 'held' AND b.held_until > now()
		GROUP BY b.slot_id`,
    [customerId, date],
  );
  return new Map(rows.rows.map((r) => [r.slot_id, r.n]));
}
