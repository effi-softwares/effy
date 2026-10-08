import type { Queryable } from "../lib/db";

/**
 * Whether the new delivery model is on at `now` (078 research R1): from that moment a customer
 * chooses ONE window for the order — today's under "Same-day delivery", a later day's under
 * "Standard delivery" — instead of the 047/069 same-day slot or standard day.
 *
 * ⚠ THE ONE READER OF THE SWITCH. It asks `public.delivery_model_v2_at` and nothing reads the
 * column behind it (`windows.guard.test.ts`). Two readers would be two opinions about which
 * checkout a customer is in — one prices a window the other refuses.
 *
 * ⚠ NOTHING SETS IT YET. The switch is turned on by the cutover (E9), behind its readiness check:
 * until the driver side can hold a parcel for a later day, a later-day order has nobody to deliver it.
 */
export async function deliveryModelV2At(q: Queryable, now: Date): Promise<boolean> {
  const row = (await q.query<{ on: boolean }>(`SELECT public.delivery_model_v2_at($1::timestamptz) AS "on"`, [now])).rows[0];
  return row?.on === true;
}
