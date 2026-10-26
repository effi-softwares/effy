// Dispatch across the days on sale: each window of a chosen day with its parcels and rounds. A later
// day's parcels have no round yet (`rounds: []` means planned on the day). Every judgement here is the
// planner's (`dueRun`), the delivery type, `packageStatuses` or `effyDays`; this only puts them together.

import { nextRunInstant, packageStatuses, query, type Queryable } from "@effy/edge-shared";
import { effyDays, loadSlotSettings, nonDeliveryDates } from "@effy/edge-shared/delivery";
import { anyTimeDayLabel, formatArrival, formatDeliveryDay, formatDeliveryWindow, type DispatchWindowsResponse } from "@effy/shared-types";

import { loadSchedule } from "../planner/repository";
import { dueRun, isoDateOf } from "../planner/service";
import { DispatchError } from "./service";

const pooled: Queryable = { query: (text, values) => query(text, values) };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** No customer name or address: the day view is a load, not a manifest. */
const WINDOW_PARCELS = `
  SELECT sf.id::text            AS package_id,
         o.id::text             AS order_id,
         o.order_number         AS order_number,
         sf.status              AS shop_status,
         opd.window_start       AS window_start,
         opd.window_end         AS window_end,
         COALESCE((SELECT ds.any_time FROM public.delivery_slot ds WHERE ds.id = opd.slot_id), false) AS any_time,
         z.name                 AS group_name,
         -- The local date it reached the hub, if it has.
         (SELECT (min(hc.checked_in_at) AT TIME ZONE 'Australia/Melbourne')::date::text
            FROM public.round_package crp
            JOIN public.round_stop crs ON crs.id = crp.stop_id
            JOIN public.hub_checkin hc ON hc.round_id = crs.round_id
           WHERE crp.shop_fulfillment_id = sf.id AND crp.state = 'picked_up') AS hub_date,
         COALESCE((SELECT bool_or(oi.storage_class IN ('chilled', 'frozen'))
                     FROM public.order_item oi
                    WHERE oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id), false) AS cold
    FROM public.shop_fulfillment sf
    JOIN public."order" o ON o.id = sf.order_id
    JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
    LEFT JOIN public.delivery_zone_postcode zp ON zp.postcode = (o.delivery_address ->> 'postalCode')
    LEFT JOIN public.delivery_zone          z  ON z.id = zp.zone_id AND z.status = 'active'
   WHERE o.status = 'paid'
     AND sf.status NOT IN ('withdrawn', 'unfulfillable')
     AND opd.window_start IS NOT NULL
     AND (opd.window_start AT TIME ZONE 'Australia/Melbourne')::date = $1::date
     AND o.delivery_type = 'effy'
   ORDER BY opd.window_start, o.order_number, sf.id
`;

const WINDOW_ROUNDS = `
  SELECT dr.id::text AS round_id, dr.window_start_at, d.id::text AS driver_id, d.name AS driver_name,
         public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) AS opens_at,
         (SELECT count(*) FROM public.round_stop rs JOIN public.round_package rp ON rp.stop_id = rs.id
           WHERE rs.round_id = dr.id AND rp.state IN ('assigned', 'delivered', 'failed'))::int AS parcels
    FROM public.driver_round dr
    JOIN public.driver d ON d.id = dr.driver_id
   WHERE dr.kind = 'delivery'
     AND dr.status IN ('planned', 'in_progress', 'completed')
     AND dr.window_start_at IS NOT NULL
     AND (dr.window_start_at AT TIME ZONE 'Australia/Melbourne')::date = $1::date
   ORDER BY dr.created_at, dr.id
`;

interface ParcelRow {
  package_id: string; order_id: string; order_number: string; shop_status: string;
  window_start: Date; window_end: Date; any_time: boolean; group_name: string | null; hub_date: string | null; cold: boolean;
}

export async function readWindows(dateParam: string | undefined, now = new Date(), db: Queryable = pooled): Promise<DispatchWindowsResponse> {
  const today = isoDateOf(now);
  const slotSettings = await loadSlotSettings(db);
  const noDates = await nonDeliveryDates(db, isoDateOf(now, -8));
  // A staff calendar: today is always shown.
  const calendar = effyDays(now, slotSettings.effyLookaheadDays, slotSettings.noWeekdays, noDates, true);
  const days = calendar.map((d) => ({ date: d.date, label: d.isToday ? "Today" : formatDeliveryDay(d.date), isToday: d.isToday }));

  const date = dateParam ?? today;
  // A day not on sale is refused, not answered empty.
  if (!ISO_DATE.test(date) || !days.some((d) => d.date === date)) {
    throw new DispatchError("invalid", "Choose today or one of the days with delivery windows on sale.");
  }

  const parcels = (await db.query<ParcelRow>(WINDOW_PARCELS, [date])).rows;
  const rounds = (await db.query<{ round_id: string; window_start_at: Date; driver_id: string; driver_name: string; opens_at: Date | null; parcels: number }>(WINDOW_ROUNDS, [date])).rows;
  const statuses = await packageStatuses(db, parcels.map((p) => p.package_id));

  const schedule = await loadSchedule(db);
  const nextRun = nextRunInstant(schedule.runs, now);
  const runCalendar = { noWeekdays: schedule.settings.noDeliveryWeekdays, noDates };
  const collectLate = (p: ParcelRow): boolean => {
    if (p.shop_status !== "ready_for_pickup" || nextRun === null) return false;
    const due = dueRun({ deliveredBy: "effy", windowStart: p.window_start }, schedule.runs, schedule.settings, runCalendar);
    return due !== null && due.getTime() < nextRun.getTime();
  };

  const byWindow = new Map<string, DispatchWindowsResponse["windows"][number]>();
  for (const p of parcels) {
    const key = `${p.window_start.getTime()}-${p.window_end.getTime()}`;
    let w = byWindow.get(key);
    if (!w) {
      const windowStart = p.window_start.toISOString();
      const windowEnd = p.window_end.toISOString();
      w = {
        windowStart, windowEnd,
        label: p.any_time
          // The day's untimed parcels, with the hours they go out in.
          ? `${anyTimeDayLabel(date, now)} (${formatDeliveryWindow({ startAt: windowStart, endAt: windowEnd })})`
          : formatArrival({ promisedFrom: null, promisedTo: null, windowStart, windowEnd }, now),
        ...(p.any_time ? { anyTime: true as const } : {}),
        rounds: rounds
          .filter((r) => r.window_start_at.getTime() === p.window_start.getTime())
          .map((r) => ({ roundId: r.round_id, driver: { id: r.driver_id, name: r.driver_name }, opensAt: r.opens_at ? r.opens_at.toISOString() : null, parcels: r.parcels })),
        parcels: [],
      };
      byWindow.set(key, w);
    }
    const status = statuses.get(p.package_id);
    if (!status) continue;
    w.parcels.push({
      packageId: p.package_id,
      orderId: p.order_id,
      orderNumber: p.order_number,
      status,
      collectLate: collectLate(p),
      // Cold goods at the hub before their day need cold storage.
      coldOvernight: p.cold && p.hub_date !== null && p.hub_date < date,
      group: p.group_name,
    });
  }
  return { days, date, windows: [...byWindow.values()] };
}
