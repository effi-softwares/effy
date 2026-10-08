// Repository for same-day delivery slots (069). Row shapes stay here and are mapped at the boundary.

import { query, withTransaction } from "@effy/edge-shared";
import type { DeliverySlotDTO, DeliverySlotLoadDTO } from "@effy/shared-types";
import type pg from "pg";

import { CALENDAR_SETTINGS, CLOSED_DATES, INSERT_SLOT, LIST_SLOTS, SLOT_FOR_UPDATE, SLOT_LOAD_ON_DAYS, UPDATE_SLOT } from "./sql";

interface SlotRow {
  id: string;
  start_time: string;
  end_time: string;
  cutoff_time: string;
  capacity: number | null;
  status: "active" | "disabled";
  updated_at: Date;
  booked_today: number;
  over_capacity_today: number;
}

function toDTO(r: SlotRow): DeliverySlotDTO {
  return {
    id: r.id,
    startTime: r.start_time,
    endTime: r.end_time,
    cutoffTime: r.cutoff_time,
    capacity: r.capacity,
    status: r.status,
    bookedToday: r.booked_today,
    overCapacityToday: r.over_capacity_today,
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listSlots(): Promise<DeliverySlotDTO[]> {
  const res = await query<SlotRow>(`${LIST_SLOTS} ORDER BY s.start_time, s.end_time`);
  return res.rows.map(toDTO);
}

/** 078 — slot → its load on each of `dates`, in the order given; a day with no booking is zero. */
export async function loadOnDays(dates: readonly string[]): Promise<Map<string, DeliverySlotLoadDTO[]>> {
  const res = await query<{ slot_id: string; delivery_date: string; booked: number; over_capacity: number }>(SLOT_LOAD_ON_DAYS, [dates]);
  const bySlot = new Map<string, Map<string, { booked: number; overCapacity: number }>>();
  for (const r of res.rows) {
    if (!bySlot.has(r.slot_id)) bySlot.set(r.slot_id, new Map());
    bySlot.get(r.slot_id)!.set(r.delivery_date, { booked: r.booked, overCapacity: r.over_capacity });
  }
  const out = new Map<string, DeliverySlotLoadDTO[]>();
  for (const [slotId, days] of bySlot) {
    out.set(slotId, dates.map((date) => ({ date, booked: days.get(date)?.booked ?? 0, overCapacity: days.get(date)?.overCapacity ?? 0 })));
  }
  return out;
}

/** 078 — the look-ahead and the closed days the Effy calendar is drawn from. Defaults until settings exist. */
export async function calendarSettings(): Promise<{ lookaheadDays: number; noWeekdays: number[]; noDates: Set<string> }> {
  const [settings, closed] = await Promise.all([
    query<{ effy_lookahead_days: number; no_weekdays: number[] | null }>(CALENDAR_SETTINGS),
    query<{ day: string }>(CLOSED_DATES),
  ]);
  const s = settings.rows[0];
  return {
    lookaheadDays: s?.effy_lookahead_days ?? 3,
    noWeekdays: s?.no_weekdays ?? [],
    noDates: new Set(closed.rows.map((r) => r.day)),
  };
}

export async function getSlot(id: string): Promise<DeliverySlotDTO | null> {
  const res = await query<SlotRow>(`${LIST_SLOTS} WHERE s.id = $1`, [id]);
  return res.rows[0] ? toDTO(res.rows[0]) : null;
}

export interface SlotValues {
  startTime: string;
  endTime: string;
  cutoffTime: string;
  /** null = no limit. */
  capacity: number | null;
  status: "active" | "disabled";
}

/** PostgreSQL's unique-violation code: two slots with the same window. */
export function isDuplicateWindow(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null &&
    (err as { code?: string }).code === "23505" &&
    String((err as { constraint?: string }).constraint ?? "").includes("delivery_slot_window_uq")
  );
}

export async function insertSlot(
  v: Omit<SlotValues, "status">,
  actorSub: string,
  audit: (tx: pg.PoolClient, id: string) => Promise<void>,
): Promise<string> {
  return withTransaction(async (tx) => {
    const res = await tx.query<{ id: string }>(INSERT_SLOT, [v.startTime, v.endTime, v.cutoffTime, v.capacity, actorSub]);
    const id = res.rows[0]!.id;
    await audit(tx, id);
    return id;
  });
}

/**
 * Change a slot under its row lock.
 *
 * `decide` is given the slot as it stands and returns what it should become — so the merge of a
 * partial PATCH and the validation of the RESULT happen against the locked row, not against a copy
 * read a moment earlier that someone else may have changed.
 *
 * ⚠ The same row lock checkout takes to hold a place. A capacity change therefore cannot interleave
 * with a customer taking the last place: one of them waits.
 */
export async function updateSlot(
  id: string,
  decide: (current: SlotValues) => SlotValues,
  actorSub: string,
  audit: (tx: pg.PoolClient, before: SlotValues, after: SlotValues) => Promise<void>,
): Promise<boolean> {
  return withTransaction(async (tx) => {
    const cur = await tx.query<{
      start_time: string; end_time: string; cutoff_time: string; capacity: number | null; status: "active" | "disabled";
    }>(SLOT_FOR_UPDATE, [id]);
    const row = cur.rows[0];
    if (!row) return false;

    const before: SlotValues = {
      startTime: row.start_time, endTime: row.end_time, cutoffTime: row.cutoff_time,
      capacity: row.capacity, status: row.status,
    };
    const after = decide(before);
    await tx.query(UPDATE_SLOT, [id, after.startTime, after.endTime, after.cutoffTime, after.capacity, after.status, actorSub]);
    await audit(tx, before, after);
    return true;
  });
}
