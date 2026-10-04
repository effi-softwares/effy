// Repository for the standard-delivery calendar (069 US6). Raw parameterized SQL, no ORM.

import { query, withTransaction } from "@effy/edge-shared";
import type { DeliveryDaysDTO, DeliveryDaysInput, NonDeliveryDateDTO } from "@effy/shared-types";
import type pg from "pg";

/**
 * Paid orders still to arrive that were promised a given day.
 *
 * ⚠ COUNTED, NEVER CHANGED (FR-043). Closing a day does not move a placed order — the customer was
 * promised that day and paid for it. The count exists so the operator knows who to tell.
 */
const AFFECTED = `
  (SELECT count(DISTINCT o.id)::int
     FROM public.order_package_delivery opd
     JOIN public."order" o ON o.id = opd.order_id
     JOIN public.shop_fulfillment sf ON sf.order_id = opd.order_id AND sf.shop_id = opd.shop_id
    WHERE o.status = 'paid'
      AND opd.method = 'standard'
      AND opd.promised_to = d.day
      AND sf.status NOT IN ('delivered', 'withdrawn', 'unfulfillable'))
`;

interface SettingsRow {
  standard_lookahead_days: number;
  standard_no_delivery_weekdays: number[];
  carrier_lead_days: number;
  slot_hold_min: number;
  sameday_hub_turnaround_min: number;
}

/** The migration's own defaults, used only until the operator has saved the delivery settings. */
const DEFAULTS: DeliveryDaysInput = {
  lookaheadDays: 7,
  noDeliveryWeekdays: [],
  carrierLeadDays: 1,
  slotHoldMin: 10,
  hubTurnaroundMin: 60,
};

async function dates(): Promise<NonDeliveryDateDTO[]> {
  const res = await query<{ day: string; label: string | null; affected: number }>(
    `SELECT d.day::text AS day, d.label, ${AFFECTED} AS affected
       FROM public.delivery_non_delivery_date d
      WHERE d.day >= (now() AT TIME ZONE 'Australia/Melbourne')::date
      ORDER BY d.day`,
  );
  return res.rows.map((r) => ({ day: r.day, label: r.label, affectedOrders: r.affected }));
}

export async function read(): Promise<{ dto: DeliveryDaysDTO; configured: boolean }> {
  const res = await query<SettingsRow>(
    `SELECT standard_lookahead_days, standard_no_delivery_weekdays, carrier_lead_days,
            slot_hold_min, sameday_hub_turnaround_min
       FROM public.delivery_settings WHERE id = 1`,
  );
  const r = res.rows[0];
  const settings: DeliveryDaysInput = r
    ? {
        lookaheadDays: r.standard_lookahead_days,
        noDeliveryWeekdays: [...r.standard_no_delivery_weekdays].sort((a, b) => a - b),
        carrierLeadDays: r.carrier_lead_days,
        slotHoldMin: r.slot_hold_min,
        hubTurnaroundMin: r.sameday_hub_turnaround_min,
      }
    : DEFAULTS;
  return { dto: { ...settings, dates: await dates() }, configured: Boolean(r) };
}

/**
 * Save the calendar settings. Returns false when the settings row does not exist.
 *
 * ⚠ AN UPDATE, NEVER AN UPSERT. `delivery_settings` is the 047 singleton and its hub coordinates are
 * NOT NULL with no default — inserting a row here would mean inventing where Effy's hub is.
 */
export async function save(
  v: DeliveryDaysInput,
  actorSub: string,
  audit: (tx: pg.PoolClient) => Promise<void>,
): Promise<boolean> {
  return withTransaction(async (tx) => {
    const res = await tx.query(
      `UPDATE public.delivery_settings
          SET standard_lookahead_days = $1, standard_no_delivery_weekdays = $2::smallint[],
              carrier_lead_days = $3, slot_hold_min = $4, sameday_hub_turnaround_min = $5,
              updated_by = $6, updated_at = now()
        WHERE id = 1`,
      [v.lookaheadDays, v.noDeliveryWeekdays, v.carrierLeadDays, v.slotHoldMin, v.hubTurnaroundMin, actorSub],
    );
    if (res.rowCount === 0) return false;
    await audit(tx);
    return true;
  });
}

export async function addDate(
  day: string,
  label: string | null,
  actorSub: string,
  audit: (tx: pg.PoolClient) => Promise<void>,
): Promise<NonDeliveryDateDTO> {
  return withTransaction(async (tx) => {
    // Idempotent on the day: saving a date that is already closed updates its label.
    await tx.query(
      `INSERT INTO public.delivery_non_delivery_date (day, label, created_by) VALUES ($1::date, $2, $3)
       ON CONFLICT (day) DO UPDATE SET label = EXCLUDED.label`,
      [day, label, actorSub],
    );
    await audit(tx);
    const res = await tx.query<{ day: string; label: string | null; affected: number }>(
      `SELECT d.day::text AS day, d.label, ${AFFECTED} AS affected
         FROM public.delivery_non_delivery_date d WHERE d.day = $1::date`,
      [day],
    );
    const r = res.rows[0]!;
    return { day: r.day, label: r.label, affectedOrders: r.affected };
  });
}

export async function removeDate(day: string, audit: (tx: pg.PoolClient) => Promise<void>): Promise<boolean> {
  return withTransaction(async (tx) => {
    const res = await tx.query(`DELETE FROM public.delivery_non_delivery_date WHERE day = $1::date`, [day]);
    if (res.rowCount === 0) return false;
    await audit(tx);
    return true;
  });
}
