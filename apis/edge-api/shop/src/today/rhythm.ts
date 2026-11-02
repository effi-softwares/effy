// When a shop's orders usually arrive. Pure, so the thresholds behind every "usually" can be tested.

/** Below this there is no pattern to speak of. */
export const MIN_DAYS = 2;
export const MIN_ORDERS = 8;
/** An hour counts as "started" at this share of the busiest hour. */
const START_SHARE = 0.25;

export interface Rhythm {
  /** The first hour with real trade; absent when it is the busiest hour too. */
  startHour?: number;
  busiestHour?: number;
}

export function usualHours(hours: readonly { hour: number; orders: number }[], days: number): Rhythm {
  const total = hours.reduce((n, h) => n + h.orders, 0);
  if (days < MIN_DAYS || total < MIN_ORDERS) return {};
  const busiest = hours.reduce((best, h) => (h.orders > best.orders ? h : best));
  const start = hours.find((h) => h.orders >= busiest.orders * START_SHARE)!;
  return start.hour < busiest.hour ? { startHour: start.hour, busiestHour: busiest.hour } : { busiestHour: busiest.hour };
}
