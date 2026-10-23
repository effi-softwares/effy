import { query, withTransaction } from "@effy/edge-shared";
import { ASAP_ESTIMATE_DEFAULT } from "@effy/edge-shared/delivery";
import type { DeliveryDaysDTO, DeliveryDaysInput, NonDeliveryDateDTO } from "@effy/shared-types";
import type pg from "pg";

/** Counted, never changed: closing a day does not move a placed order; the operator knows who to tell. */
const AFFECTED = `
  (SELECT count(DISTINCT o.id)::int
     FROM public.order_package_delivery opd
     JOIN public."order" o ON o.id = opd.order_id
     JOIN public.shop_fulfillment sf ON sf.order_id = opd.order_id AND sf.shop_id = opd.shop_id
    WHERE o.status = 'paid'
      -- ⚠ WHATEVER ITS METHOD. A closed day now also stops Effy's own windows, so the people to
      -- tell include anyone promised a window that day, today's included.
      AND opd.promised_to = d.day
      AND sf.status NOT IN ('delivered', 'withdrawn', 'unfulfillable'))
`;

interface SettingsRow {
  standard_no_delivery_weekdays: number[];
  slot_hold_min: number;
  sameday_hub_turnaround_min: number;
  effy_lookahead_days: number;
  asap_estimate: string;
  load_overdue_min: number;
  checkin_overdue_min: number;
  vehicle_check_required: boolean;
}

/** The migrations' defaults, until the operator saves the settings. */
const DEFAULTS: Omit<DeliveryDaysDTO, "dates"> = {
  effyLookaheadDays: 3,
  noDeliveryWeekdays: [],
  slotHoldMin: 10,
  hubTurnaroundMin: 60,
  asapEstimate: ASAP_ESTIMATE_DEFAULT,
  loadOverdueMin: 20,
  checkinOverdueMin: 30,
  vehicleCheckRequired: false,
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
    `SELECT standard_no_delivery_weekdays,
            slot_hold_min, sameday_hub_turnaround_min, effy_lookahead_days, asap_estimate,
            load_overdue_min, checkin_overdue_min, vehicle_check_required
       FROM public.delivery_settings WHERE id = 1`,
  );
  const r = res.rows[0];
  const settings: Omit<DeliveryDaysDTO, "dates"> = r
    ? {
        noDeliveryWeekdays: [...r.standard_no_delivery_weekdays].sort((a, b) => a - b),
        slotHoldMin: r.slot_hold_min,
        hubTurnaroundMin: r.sameday_hub_turnaround_min,
        effyLookaheadDays: r.effy_lookahead_days,
        asapEstimate: r.asap_estimate,
        loadOverdueMin: r.load_overdue_min,
        checkinOverdueMin: r.checkin_overdue_min,
        vehicleCheckRequired: r.vehicle_check_required,
      }
    : DEFAULTS;
  return { dto: { ...settings, dates: await dates() }, configured: Boolean(r) };
}

/** false when the settings row does not exist. An UPDATE, never an upsert: inserting would invent the hub. */
export async function save(
  v: DeliveryDaysInput,
  actorSub: string,
  audit: (tx: pg.PoolClient) => Promise<void>,
): Promise<boolean> {
  return withTransaction(async (tx) => {
    const res = await tx.query(
      `UPDATE public.delivery_settings
          SET effy_lookahead_days = $1, standard_no_delivery_weekdays = $2::smallint[],
              slot_hold_min = $3, sameday_hub_turnaround_min = $4,
              -- Reworded when the request carries one; kept otherwise.
              asap_estimate = COALESCE($6, asap_estimate),
              -- Kept when the request carries none.
              load_overdue_min = COALESCE($7, load_overdue_min),
              checkin_overdue_min = COALESCE($8, checkin_overdue_min),
              vehicle_check_required = COALESCE($9, vehicle_check_required),
              updated_by = $5, updated_at = now()
        WHERE id = 1`,
      [v.effyLookaheadDays, v.noDeliveryWeekdays, v.slotHoldMin, v.hubTurnaroundMin, actorSub,
       v.asapEstimate ?? null, v.loadOverdueMin ?? null, v.checkinOverdueMin ?? null, v.vehicleCheckRequired ?? null],
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
    // Idempotent on the day: re-saving a closed date updates its label.
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
